import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ChatMessage } from "@/app/lib/chat/types";
import { POST, DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), limit: vi.fn(), load: vi.fn(), save: vi.fn(), clear: vi.fn(),
  condense: vi.fn(), retrieve: vi.fn(),
}));
vi.mock("@/app/_auth/validate-request", () => ({ validateRequest: mocks.auth }));
vi.mock("@/app/lib/redis", () => ({ redis: {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow() { return {}; }
  limit = mocks.limit;
} }));
vi.mock("@/app/lib/chat/store", () => ({ loadChat: mocks.load, saveChat: mocks.save, clearChat: mocks.clear }));
vi.mock("@/app/lib/chat/retrieval", () => ({ condenseQuery: mocks.condense, retrieveContext: mocks.retrieve }));
vi.mock("@/app/lib/chat/model", async () => {
  const { MockLanguageModelV4, simulateReadableStream } = await import("ai/test");
  return {
    providerOptions: { deepseek: { thinking: { type: "disabled" } } },
    chatModel: new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Ibuprofen " },
            { type: "text-delta", id: "text-1", delta: "relieves pain." },
            { type: "text-end", id: "text-1" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: {
              inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 5, text: 5, reasoning: 0 },
            } },
          ], chunkDelayInMs: 30,
        }),
      }),
    }),
  };
});

const question: ChatMessage = { id: "question", role: "user", parts: [{ type: "text", text: "What is ibuprofen used for?" }] };
const request = (body: unknown = { id: "default", message: question }, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/chat", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "stable-user" } });
  mocks.limit.mockResolvedValue({ success: true, reset: Date.now() + 10_000 });
  mocks.load.mockResolvedValue([]);
  mocks.condense.mockResolvedValue("ibuprofen uses");
  mocks.retrieve.mockResolvedValue({ docs: ["label"], sources: [{ id: "label-id", score: 0.8 }] });
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
  ])("rejects invalid or forged input: %j", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("returns 400 for malformed JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", { method: "POST", body: "{" });
    expect((await POST(req)).status).toBe(400);
  });
});

it("streams with server history, raw persisted questions, source metadata and unique IDs", async () => {
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
  expect(messages[3].metadata).toEqual({ sources: [{ id: "label-id", score: 0.8 }] });
  expect(new Set(messages.map(message => message.id)).size).toBe(4);
  expect(JSON.stringify(messages)).not.toContain("reference_material");
});

it("persists a partial assistant response when the client disconnects", async () => {
  const response = await POST(request());
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done || decoder.decode(value).includes("Ibuprofen ")) break;
  }
  await reader.cancel();
  await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  const messages = mocks.save.mock.calls[0][1] as ChatMessage[];
  expect(messages[0]).toEqual(question);
  const text = messages.at(-1)!.parts.filter(part => part.type === "text").map(part => part.text).join("");
  expect(text).toBe("Ibuprofen ");
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
