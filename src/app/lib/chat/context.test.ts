import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { mergeIncoming, selectHistoryWindow, withReferenceMaterial } from "./context";
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

describe("selectHistoryWindow", () => {
  it("keeps recent messages and drops an orphaned leading assistant", () => {
    expect(selectHistoryWindow(history, { maxMessages: 3 })).toEqual(history.slice(2));
  });
  it("enforces the character budget", () => {
    expect(selectHistoryWindow(history, { maxChars: 8 })).toEqual(history.slice(2));
    expect(selectHistoryWindow(history, { maxChars: 3 })).toEqual([]);
  });
  it("handles empty input and budgets", () => {
    expect(selectHistoryWindow([])).toEqual([]);
    expect(selectHistoryWindow(history, { maxMessages: 0 })).toEqual([]);
  });
  it("uses the 24-message and 24000-character defaults", () => {
    const messages = Array.from({ length: 40 }, (_, i) => msg(String(i), i % 2 ? "assistant" : "user", "x".repeat(1000)));
    expect(selectHistoryWindow(messages)).toEqual(messages.slice(-24));
  });
});

describe("withReferenceMaterial", () => {
  it("changes only the latest user message, preserving the prefix and original input", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "ibuprofen" },
      { role: "assistant", content: "pain relief" },
      { role: "user", content: "side effects?" },
    ];
    const result = withReferenceMaterial(messages, ["drug label"]);
    expect(result.slice(0, 2)).toEqual(messages.slice(0, 2));
    expect(result[0]).toBe(messages[0]);
    expect(result[2].content).toContain('<reference_material source="knowledge_base">');
    expect(result[2].content).toContain("side effects?");
    expect(messages[2].content).toBe("side effects?");
  });
  it("supports multipart content and empty retrieval results", () => {
    const messages: ModelMessage[] = [{ role: "user", content: [{ type: "text", text: "question" }] }];
    expect(withReferenceMaterial(messages, [])[0].content).toEqual([
      { type: "text", text: '<reference_material source="knowledge_base">\n[]\n</reference_material>\n\n' },
      { type: "text", text: "question" },
    ]);
  });
});
