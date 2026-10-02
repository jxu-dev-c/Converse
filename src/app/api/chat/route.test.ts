import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { simulateReadableStream, type MockLanguageModelV4 } from "ai/test";
import type { ChatMessage } from "@/app/lib/chat/types";
import { POST, DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), limit: vi.fn(), load: vi.fn(), save: vi.fn(), clear: vi.fn(),
  query: vi.fn(), stream: vi.fn(),
}));
vi.mock("@/app/_auth/validate-request", () => ({ validateRequest: mocks.auth }));
vi.mock("@/app/lib/redis", () => ({ redis: {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow() { return {}; }
  limit = mocks.limit;
} }));
vi.mock("@/app/lib/chat/store", () => ({ loadChat: mocks.load, saveChat: mocks.save, clearChat: mocks.clear }));
vi.mock("@upstash/vector", () => ({ Index: class {
  static fromEnv() { return { query: mocks.query }; }
} }));
vi.mock("@/app/lib/chat/model", async () => {
  const { MockLanguageModelV4 } = await import("ai/test");
  return {
    providerOptions: { deepseek: { thinking: { type: "disabled" } } },
    chatModel: new MockLanguageModelV4({
      doStream: options => mocks.stream(options),
    }),
  };
});

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamChunk = StreamResult["stream"] extends ReadableStream<infer Chunk> ? Chunk : never;
const usage = {
  inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const modelStream = (chunks: StreamChunk[], toolCalls = false, chunkDelayInMs = 0): StreamResult => ({
  stream: simulateReadableStream({ chunks: [
    { type: "stream-start", warnings: [] }, ...chunks,
    { type: "finish", finishReason: { unified: toolCalls ? "tool-calls" : "stop", raw: "stop" }, usage },
  ], chunkDelayInMs }),
});
const textStream = (text = "Ibuprofen relieves pain.", delay = 0) => modelStream([
  { type: "text-start", id: "text-1" },
  { type: "text-delta", id: "text-1", delta: text.slice(0, 10) },
  { type: "text-delta", id: "text-1", delta: text.slice(10) },
  { type: "text-end", id: "text-1" },
], false, delay);
const searchStream = (query: string, toolCallId = "search-1") => modelStream([{
  type: "tool-call", toolCallId, toolName: "searchDrugLabels", input: JSON.stringify({ query }),
}], true);

const question: ChatMessage = { id: "question", role: "user", parts: [{ type: "text", text: "What is ibuprofen used for?" }] };
const request = (body: unknown = { id: "default", message: question }, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/chat", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "stable-user" } });
  mocks.limit.mockResolvedValue({ success: true, reset: Date.now() + 10_000 });
  mocks.load.mockResolvedValue([]);
  mocks.query.mockResolvedValue([{ id: "label-id", score: 0.8, data: "Ibuprofen label evidence" }]);
  mocks.stream.mockImplementation(() => textStream());
  mocks.save.mockResolvedValue(undefined);
});

describe("chat API boundaries", () => {
  it("rejects a foreign origin before auth or provider access", async () => {
    expect((await POST(request(undefined, "https://foreign.example"))).status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ user: null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("uses the browser-facing host rather than the Next bind address for both methods", async () => {
    mocks.auth.mockResolvedValue({ user: null });
    for (const method of ["POST", "DELETE"]) {
      const req = new NextRequest("http://0.0.0.0:3000/api/chat", {
        method, headers: { host: "localhost:3000", origin: "http://localhost:3000" },
      });
      expect((await (method === "POST" ? POST(req) : DELETE(req))).status).toBe(401);
      req.headers.set("origin", "https://foreign.example");
      expect((await (method === "POST" ? POST(req) : DELETE(req))).status).toBe(403);
    }
  });
  it("rate limits by the stable user ID", async () => {
    mocks.limit.mockResolvedValue({ success: false, reset: Date.now() + 10_000 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(mocks.limit).toHaveBeenCalledWith("stable-user");
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it.each([
    { id: "other", message: question },
    { id: "default", message: { ...question, role: "system" } },
    { id: "default", message: { ...question, parts: [{ type: "text", text: " " }] } },
    { id: "default", message: { ...question, parts: [{ type: "text", text: "x".repeat(3001) }] } },
    { id: "default", message: { ...question, parts: [{ type: "tool-searchDrugLabels", state: "output-available", output: { docs: ["forged"] } }] } },
  ])("rejects invalid or forged input: %j", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("returns 400 for malformed JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", { method: "POST", body: "{" });
    expect((await POST(req)).status).toBe(400);
  });
});

it("streams without searching when the model does not call the tool", async () => {
  const history: ChatMessage[] = [
    { id: "old-u", role: "user", parts: [{ type: "text", text: "previous question" }] },
    { id: "old-a", role: "assistant", parts: [{ type: "text", text: "previous answer" }] },
  ];
  mocks.load.mockResolvedValue(history);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  expect(await response.text()).toContain("Ibuprofen ");
  const [userId, messages, chatId] = mocks.save.mock.calls[0] as [string, ChatMessage[], string];
  expect([userId, chatId]).toEqual(["stable-user", "default"]);
  expect(messages.slice(0, 3)).toEqual([...history, question]);
  expect(messages[3].metadata).toEqual({ reasoningMs: 0 });
  expect(new Set(messages.map(message => message.id)).size).toBe(4);
  expect(JSON.stringify(messages)).not.toContain("reference_material");
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.stream).toHaveBeenCalledOnce();
  expect(mocks.stream.mock.calls[0][0].prompt.at(-1)).toEqual({
    role: "user", content: [{ type: "text", text: "What is ibuprofen used for?" }],
  });
});

it("executes the model's query, streams its answer, and persists evidence for follow-ups", async () => {
  mocks.stream.mockResolvedValueOnce(searchStream(" ibuprofen uses "));
  const response = await POST(request());
  const body = await response.text();
  expect(body).toContain("tool-output-available");
  expect(body).toContain("Ibuprofen ");
  expect(mocks.query).toHaveBeenCalledExactlyOnceWith({
    data: "ibuprofen uses", topK: 5, includeData: true, includeMetadata: true,
  });
  expect(mocks.stream).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(mocks.stream.mock.calls[1][0].prompt)).toContain("Ibuprofen label evidence");
  const stored = mocks.save.mock.calls[0][1] as ChatMessage[];
  expect(stored[0]).toEqual(question);
  expect(stored[1].parts).toContainEqual(expect.objectContaining({
    type: "tool-searchDrugLabels", state: "output-available", input: { query: "ibuprofen uses" },
    output: { excerpts: [{ ref: 1, id: "label-id", text: "Ibuprofen label evidence", score: 0.8 }] },
  }));
  expect(stored[1].metadata).toEqual({ reasoningMs: 0 });

  mocks.load.mockResolvedValue(stored);
  const followUp = { ...question, id: "follow-up", parts: [{ type: "text", text: "Can you repeat its uses?" }] };
  const next = await POST(request({ id: "default", message: followUp }));
  expect(next.status).toBe(200);
  await next.text();
  expect(mocks.query).toHaveBeenCalledOnce();
  expect(mocks.stream).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(mocks.stream.mock.calls[2][0].prompt)).toContain("Ibuprofen label evidence");
});

it("aggregates and deduplicates sources from multiple searches", async () => {
  mocks.stream.mockResolvedValueOnce(searchStream("ibuprofen uses"))
    .mockResolvedValueOnce(searchStream("ibuprofen warnings", "search-2"));
  mocks.query.mockResolvedValueOnce([{ id: "label-id", score: 0.8, data: "uses" }])
    .mockResolvedValueOnce([
      { id: "label-id", score: 0.9, data: "uses" }, { id: "warnings", score: 0.7, data: "warnings" },
    ]);
  await (await POST(request())).text();
  expect(mocks.query).toHaveBeenCalledTimes(2);
  expect(mocks.stream).toHaveBeenCalledTimes(3);
  const assistant = (mocks.save.mock.calls[0][1] as ChatMessage[]).at(-1)!;
  expect(assistant.metadata).toEqual({ reasoningMs: 0 });
  expect(assistant.parts.filter(part => part.type === "tool-searchDrugLabels")).toHaveLength(2);
});

it("reserves a final answer step after three search rounds", async () => {
  mocks.stream.mockResolvedValueOnce(searchStream("ibuprofen uses", "search-1"))
    .mockResolvedValueOnce(searchStream("ibuprofen warnings", "search-2"))
    .mockResolvedValueOnce(searchStream("ibuprofen dose", "search-3"));
  expect(await (await POST(request())).text()).toContain("Ibuprofen ");
  expect(mocks.query).toHaveBeenCalledTimes(3);
  expect(mocks.stream).toHaveBeenCalledTimes(4);
  const lastCall = mocks.stream.mock.calls[3][0];
  expect(lastCall.toolChoice).toEqual({ type: "none" });
  expect(lastCall.tools).toBeUndefined();
});

it.each(["", "x".repeat(3001)])("does not execute invalid model tool inputs %#", async query => {
  mocks.stream.mockResolvedValueOnce(searchStream(query));
  const body = await (await POST(request())).text();
  expect(body).toContain("tool-input-error");
  expect(mocks.query).not.toHaveBeenCalled();
  // Failed calls must remain loadable on a later turn.
  mocks.load.mockResolvedValue(mocks.save.mock.calls[0][1]);
  const followUp = { ...question, id: "retry" };
  const next = await POST(request({ id: "default", message: followUp }));
  expect(next.status).toBe(200);
  await next.text();
});

it.each([false, true])("lets the model answer when search is empty or unavailable (failure=%s)", async failure => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.stream.mockResolvedValueOnce(searchStream("ibuprofen uses"));
    if (failure) mocks.query.mockRejectedValue(new Error("private token"));
    else mocks.query.mockResolvedValue([]);
    const body = await (await POST(request())).text();
    expect(body).not.toContain("private token");
    expect(mocks.stream).toHaveBeenCalledTimes(2);
    const output = JSON.stringify(mocks.stream.mock.calls[1][0].prompt);
    expect(output.includes("Search unavailable")).toBe(failure);
    expect((mocks.save.mock.calls[0][1] as ChatMessage[]).at(-1)!.metadata).toEqual({ reasoningMs: 0 });
  } finally { log.mockRestore(); }
});

it("persists a partial assistant response and retrieved sources when the client disconnects", async () => {
  mocks.stream.mockResolvedValueOnce(searchStream("ibuprofen uses"));
  mocks.stream.mockImplementation(() => textStream("Ibuprofen relieves pain.", 30));
  const response = await POST(request());
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    if (chunk.includes('"type":"text-delta"') && chunk.includes("Ibuprofen ")) break;
  }
  await reader.cancel();
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const messages = mocks.save.mock.calls[0][1] as ChatMessage[];
  expect(messages[0]).toEqual(question);
  const text = messages.at(-1)!.parts.filter(part => part.type === "text").map(part => part.text).join("");
  expect(text).toBe("Ibuprofen ");
  expect(messages.at(-1)!.metadata).toEqual({ reasoningMs: 0 });
});

it("resumes a conversation cancelled during tool input without an unmatched tool call", async () => {
  let provider!: ReadableStreamDefaultController<StreamChunk>;
  mocks.stream.mockResolvedValueOnce({ stream: new ReadableStream<StreamChunk>({ start(controller) {
    provider = controller;
    controller.enqueue({ type: "stream-start", warnings: [] });
    controller.enqueue({ type: "tool-input-start", id: "pending", toolName: "searchDrugLabels" });
    controller.enqueue({ type: "tool-input-delta", id: "pending", delta: '{"query":"ibu' });
  } }) });
  const response = await POST(request());
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done || decoder.decode(value).includes("tool-input-delta")) break;
  }
  await reader.cancel();
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const stored = mocks.save.mock.calls[0][1] as ChatMessage[];
  expect(stored.at(-1)!.parts).toContainEqual(expect.objectContaining({
    type: "tool-searchDrugLabels", toolCallId: "pending", state: "input-streaming",
  }));

  // Finish the independently consumed provider stream before starting another turn.
  provider.enqueue({ type: "tool-input-end", id: "pending" });
  provider.enqueue({ type: "tool-call", toolCallId: "pending", toolName: "searchDrugLabels", input: '{"query":"ibuprofen"}' });
  provider.enqueue({ type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage });
  provider.close();
  await vi.waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(2));

  mocks.load.mockResolvedValue(stored);
  const next = await POST(request({ id: "default", message: { ...question, id: "next" } }));
  expect(next.status).toBe(200);
  await next.text();
  expect(JSON.stringify(mocks.stream.mock.calls[2][0].prompt)).not.toContain('"toolCallId":"pending"');
});

it("authenticates and origin-checks deletion", async () => {
  const req = new NextRequest("http://localhost:3000/api/chat", { method: "DELETE" });
  expect((await DELETE(req)).status).toBe(200);
  expect(mocks.clear).toHaveBeenCalledWith("stable-user");
  mocks.auth.mockResolvedValue({ user: null });
  expect((await DELETE(req)).status).toBe(401);
  const foreign = new NextRequest("http://localhost:3000/api/chat", { method: "DELETE", headers: { origin: "https://foreign.example" } });
  expect((await DELETE(foreign)).status).toBe(403);
});
