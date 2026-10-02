import { describe, expect, it } from "vitest";
import { citedRefs, createCitationRegistry, excerptFields } from "./citations";
import type { ChatMessage } from "./types";
it("resolves refs across all history including legacy tool output", () => {
  const history: ChatMessage[] = [{ id: "a", role: "assistant", parts: [{ type: "tool-searchDrugLabels", toolCallId: "t", state: "output-available", input: { query: "uses" }, output: { docs: ["Legacy evidence"], sources: [{ id: "label", score: 0.8 }] } }] }];
  const registry = createCitationRegistry(history);
  expect(registry.excerpts.get(1)?.text).toBe("Legacy evidence");
  const excerpt = registry.register({ id: "label", text: "new evidence", score: 0.9 });
  expect(excerpt.ref).toBe(1);
  history.push({ id: "b", role: "assistant", parts: [{ type: "tool-searchDrugLabels", toolCallId: "t2", state: "output-available", input: { query: "warnings" }, output: { excerpts: [excerpt] } }] });
  expect(createCitationRegistry(history).register({ id: "new", text: "warning", score: 0.7 }).ref).toBe(2);
});
it("collects adjacent refs and excludes code and links", () => {
  expect(citedRefs("Claim [1][2], again [1]. `code [3]` [4](https://example.org)\n\n```\n[5]\n```\n\n| claim |\n|---|\n| Evidence [6] |" )).toEqual([1, 2, 6]);
});

describe("excerptFields", () => {
  it("parses JSON label excerpts into readable fields without title fields", () => {
    expect(excerptFields('{"Drug_Name": "allergy relief", "Manufacturer": "CVS", "Purpose": "Antihistamine", "Indications_and_Usage": "relieves \\u2022 runny nose", "Warnings": ""}')).toEqual([
      { label: "Purpose", value: "Antihistamine" },
      { label: "Indications and Usage", value: "relieves • runny nose" },
    ]);
  });
  it("falls back to plain text", () => {
    expect(excerptFields("plain excerpt")).toEqual([{ label: "", value: "plain excerpt" }]);
  });
});
