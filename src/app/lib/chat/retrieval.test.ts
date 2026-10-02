import { afterEach, describe, expect, it, vi } from "vitest";
import { Index } from "@upstash/vector";
import { createSearchTools, retrieveContext, searchInputSchema } from "./retrieval";

afterEach(() => vi.restoreAllMocks());

it("retrieves hosted embeddings and filters low-score or missing documents", async () => {
  const query = vi.fn().mockResolvedValue([
    { id: "good", score: 0.8, data: "label" },
    { id: 2, score: 0.5, data: "threshold" },
    { id: "low", score: 0.49, data: "irrelevant" },
    { id: "missing", score: 0.9 },
  ]);
  vi.spyOn(Index, "fromEnv").mockReturnValue({ query } as unknown as Index);
  expect(await retrieveContext("ibuprofen")).toEqual({
    docs: ["label", "threshold"], sources: [{ id: "good", score: 0.8 }, { id: "2", score: 0.5 }],
  });
  expect(query).toHaveBeenCalledWith({ data: "ibuprofen", topK: 5, includeData: true, includeMetadata: true });
});

describe("search tool", () => {
  it.each(["", "   ", "x".repeat(3001), null, 123])("rejects invalid query %#", query => {
    expect(searchInputSchema.safeParse({ query }).success).toBe(false);
  });
  it("accepts trimmed queries up to 3000 characters", () => {
    expect(searchInputSchema.parse({ query: " ibuprofen uses " })).toEqual({ query: "ibuprofen uses" });
    expect(searchInputSchema.safeParse({ query: "x".repeat(3000) }).success).toBe(true);
  });
  it("distinguishes unavailable search from no matching excerpts without exposing errors", async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("secret URL/token"));
    vi.spyOn(Index, "fromEnv").mockReturnValue({ query } as unknown as Index);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const sources = vi.fn();
    const { searchDrugLabels } = createSearchTools(sources);
    const options = { toolCallId: "call", messages: [], context: {} };
    expect(await searchDrugLabels.execute!({ query: "ibuprofen" }, options)).toEqual({ docs: [], sources: [] });
    expect(await searchDrugLabels.execute!({ query: "ibuprofen" }, options)).toEqual({
      docs: [], sources: [], error: "Search unavailable. Please try again.",
    });
    expect(sources).toHaveBeenCalledExactlyOnceWith([]);
    expect(log).toHaveBeenCalledExactlyOnceWith("Chat search failed");
  });
});
