import { describe, expect, it } from "vitest";
import { convertToModelMessages, validateUIMessages } from "ai";
import { mergeIncoming, prepareHistory } from "./context";
import { createSearchTools } from "./retrieval";
import type { ChatMessage } from "./types";

const msg = (id: string, role: "user" | "assistant", text = "text"): ChatMessage => ({
  id, role, parts: [{ type: "text", text }],
});
const history = [msg("u1", "user"), msg("a1", "assistant"), msg("u2", "user"), msg("a2", "assistant")];

describe("mergeIncoming", () => {
  it("appends without changing the stored history", () => {
    expect(mergeIncoming(history, msg("u3", "user"))).toHaveLength(5);
    expect(history).toHaveLength(4);
  });
  it("truncates an existing turn and its answer for a retry", () => {
    expect(mergeIncoming(history, msg("u2", "user", "retry"))).toEqual([
      ...history.slice(0, 2), msg("u2", "user", "retry"),
    ]);
  });
  it("truncates later turns when regenerating an older question", () => {
    expect(mergeIncoming(history, msg("u1", "user"))).toEqual([history[0]]);
  });
});

describe("prepareHistory", () => {
  it("keeps recent messages and drops an orphaned leading assistant", () => {
    expect(prepareHistory(history, { maxMessages: 3 })).toEqual(history.slice(2));
  });
  it("enforces the estimated token budget", () => {
    expect(prepareHistory(history, { maxTokens: 16 })).toEqual(history.slice(2));
    expect(prepareHistory(history, { maxTokens: 3 })).toEqual([]);
  });
  it("handles empty input and budgets", () => {
    expect(prepareHistory([])).toEqual([]);
    expect(prepareHistory(history, { maxMessages: 0 })).toEqual([]);
  });
  it("uses the 40-message and 12000-token defaults", () => {
    const messages = Array.from({ length: 40 }, (_, i) => msg(String(i), i % 2 ? "assistant" : "user", "x".repeat(1000)));
    expect(prepareHistory(messages)).toEqual(messages);
  });
});

it("counts tool evidence against the history budget and retains whole turns", () => {
  const evidence: ChatMessage = { id: "a", role: "assistant", parts: [{
    type: "tool-searchDrugLabels", toolCallId: "call", state: "output-available",
    input: { query: "ibuprofen uses" }, output: { docs: ["x".repeat(1000)], sources: [] },
  }] };
  const messages = [msg("u", "user"), evidence, msg("next", "user")];
  expect(prepareHistory(messages, { maxTokens: 100 })).toEqual(messages.slice(-1));
  expect(prepareHistory(messages, { maxTokens: 2000 })).toEqual(messages);
});

it("omits unfinished tool calls after cancellation, preserving completed evidence", async () => {
  const tools = createSearchTools();
  const messages: ChatMessage[] = [msg("u", "user"), { id: "a", role: "assistant", parts: [
    { type: "tool-searchDrugLabels", toolCallId: "done", state: "output-available",
      input: { query: "ibuprofen uses" }, output: { docs: ["label evidence"], sources: [] } },
    { type: "tool-searchDrugLabels", toolCallId: "pending", state: "input-streaming", input: { query: "ibu" } },
  ] }, msg("next", "user")];
  const validated = await validateUIMessages<ChatMessage>({ messages, tools });
  const converted = await convertToModelMessages(validated, { tools, ignoreIncompleteToolCalls: true });
  expect(JSON.stringify(converted)).toContain("label evidence");
  expect(JSON.stringify(converted)).toContain('"toolCallId":"done"');
  expect(JSON.stringify(converted)).not.toContain('"toolCallId":"pending"');
  expect(converted.map(message => message.role)).toEqual(["user", "assistant", "tool", "user"]);
});

it("validates stored tool outputs", async () => {
  const tools = createSearchTools();
  const messages = [{ id: "a", role: "assistant", parts: [{
    type: "tool-searchDrugLabels", toolCallId: "call", state: "output-available",
    input: { query: "ibuprofen" }, output: { docs: [123], sources: [] },
  }] }];
  await expect(validateUIMessages({ messages, tools })).rejects.toThrow();
});

it("strips reasoning without mutating stored messages and prunes evidence older than three user turns", () => {
  const old: ChatMessage = { id: "old", role: "assistant", parts: [
    { type: "reasoning", text: "private thought" },
    { type: "tool-searchDrugLabels", toolCallId: "old", state: "output-available", input: { query: "ibuprofen" }, output: { docs: ["evidence"], sources: [] } },
    { type: "text", text: "answer" },
  ] };
  const prepared = prepareHistory([msg("u0", "user"), old, msg("u1", "user"), msg("u2", "user"), msg("u3", "user")]);
  expect(prepared[1].parts).toEqual([{ type: "text", text: "answer" }]);
  expect(old.parts).toHaveLength(3);
});
