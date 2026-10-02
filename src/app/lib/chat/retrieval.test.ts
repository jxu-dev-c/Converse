import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { Index } from "@upstash/vector";
import { condenseQuery, retrieveContext } from "./retrieval";
import type { ChatMessage } from "./types";

const message = (id: string, role: "user" | "assistant", text: string): ChatMessage => ({ id, role, parts: [{ type: "text", text }] });
const window = [message("u1", "user", "What is ibuprofen used for?"), message("a1", "assistant", "Pain relief"), message("u2", "user", "What are its side effects?")];
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const modelWithText = (text: string) => new MockLanguageModelV4({
  doGenerate: { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] },
});

describe("condenseQuery", () => {
  it("skips the model on the first turn", async () => {
    const model = new MockLanguageModelV4();
    expect(await condenseQuery(window.slice(0, 1), model)).toBe("What is ibuprofen used for?");
    expect(model.doGenerateCalls).toHaveLength(0);
  });
  it("rewrites follow-ups with actual AI SDK generation and role messages", async () => {
    const model = modelWithText(" ibuprofen side effects ");
    expect(await condenseQuery(window, model)).toBe("ibuprofen side effects");
    const prompt = model.doGenerateCalls[0].prompt;
    expect(prompt.map(message => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(JSON.stringify(prompt)).toContain("ibuprofen");
    expect(JSON.stringify(prompt.at(-1))).toContain("Rewrite this question");
    expect(JSON.stringify(prompt.at(-1))).toContain("What are its side effects?");
    expect(model.doGenerateCalls[0].providerOptions).toEqual({ deepseek: { thinking: { type: "disabled" } } });
  });
  it("limits the condensation history to recent turns", async () => {
    const model = modelWithText("ibuprofen dose");
    await condenseQuery([...window.slice(0, 2), ...window.slice(0, 2), ...window.slice(0, 2), ...window], model);
    expect(model.doGenerateCalls[0].prompt).toHaveLength(6); // instructions plus five role messages
    expect(model.doGenerateCalls[0].prompt[1].role).toBe("user");
  });
  it("falls back to the raw question on provider errors", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw new Error("unavailable"); } });
    expect(await condenseQuery(window, model)).toBe("What are its side effects?");
  });
  it("falls back on an empty response", async () => {
    expect(await condenseQuery(window, modelWithText(" "))).toBe("What are its side effects?");
  });
});

it("retrieves hosted embeddings and filters low-score or missing documents", async () => {
  const query = vi.fn().mockResolvedValue([
    { id: "good", score: 0.8, data: "label" },
    { id: 2, score: 0.5, data: "threshold" },
    { id: "low", score: 0.49, data: "irrelevant" },
    { id: "missing", score: 0.9 },
  ]);
  const spy = vi.spyOn(Index, "fromEnv").mockReturnValue({ query } as unknown as Index);
  try {
    expect(await retrieveContext("ibuprofen")).toEqual({
      docs: ["label", "threshold"], sources: [{ id: "good", score: 0.8 }, { id: "2", score: 0.5 }],
    });
    expect(query).toHaveBeenCalledWith({ data: "ibuprofen", topK: 5, includeData: true, includeMetadata: true });
  } finally { spy.mockRestore(); }
});
