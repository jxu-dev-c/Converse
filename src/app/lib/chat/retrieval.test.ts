import { afterEach, describe, expect, it, vi } from "vitest";
import { Index } from "@upstash/vector";
import { createSearchTools, createCitationRegistry, searchOutputSchema, retrieveContext, searchInputSchema } from "./retrieval";

afterEach(() => vi.restoreAllMocks());

it("retrieves hosted embeddings and filters low-score or missing documents", async () => {
  const query = vi.fn().mockResolvedValue([
    { id: "good", score: 0.8, data: "label" },
    { id: 2, score: 0.5, data: "threshold" },
    { id: "low", score: 0.49, data: "irrelevant" },
    { id: "missing", score: 0.9 },
  ]);
  vi.spyOn(Index, "fromEnv").mockReturnValue({ query } as unknown as Index);
  expect(await retrieveContext("ibuprofen")).toEqual([{ id: "good", score: 0.8, text: "label" }, { id: "2", score: 0.5, text: "threshold" }]);
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
    const { searchDrugLabels } = createSearchTools();
    const options = { toolCallId: "call", messages: [], context: createCitationRegistry([]) };
    expect(await searchDrugLabels.execute!({ query: "ibuprofen" }, options)).toEqual({ excerpts: [] });
    expect(await searchDrugLabels.execute!({ query: "ibuprofen" }, options)).toEqual({
      excerpts: [], error: "Search unavailable. Please try again.",
    });
    expect(log).toHaveBeenCalledExactlyOnceWith("Chat search failed");
  });
});

it("maps tolerant metadata into a title", async () => {
  vi.spyOn(Index, "fromEnv").mockReturnValue({ query: vi.fn().mockResolvedValue([{ id: "a", data: "label", score: 0.8, metadata: { Drug_Name: "Advil", Manufacturer: ["Haleon"] } }]) } as unknown as Index);
  expect((await retrieveContext("ibuprofen"))[0].title).toBe("Advil (Haleon)");
});
it("keeps stable refs and renders model anchors while accepting legacy outputs", async () => {
  const registry = createCitationRegistry([]);
  const first = registry.register({ id: "a", text: "pain", score: 0.8, title: "Advil (Haleon)" });
  expect(registry.register({ id: "a", text: "pain", score: 0.9 }).ref).toBe(1);
  expect(registry.register({ id: "b", text: "warnings", score: 0.8 }).ref).toBe(2);
  expect(searchOutputSchema.safeParse({ docs: ["legacy"], sources: [{ id: "old", score: 0.7 }] }).success).toBe(true);
  const output = await createSearchTools().searchDrugLabels.toModelOutput!({ toolCallId: "call", input: { query: "uses" }, output: { excerpts: [first] } });
  expect(output).toEqual({ type: "text", value: "[1] Advil (Haleon)\npain" });
});
