import { Marked, type Token } from "marked";
import { z } from "zod";
import type { ChatMessage } from "./types";

export const excerptSchema = z.object({
  ref: z.number().int().positive(), id: z.string(), title: z.string().optional(), text: z.string(), score: z.number(),
});
export type Excerpt = z.infer<typeof excerptSchema>;
export type CitationRegistry = {
  refs: Map<string, number>;
  excerpts: Map<number, Excerpt>;
  register: (label: Omit<Excerpt, "ref">) => Excerpt;
}

export function createCitationRegistry(history: ChatMessage[]): CitationRegistry {
  const refs = new Map<string, number>();
  const excerpts = new Map<number, Excerpt>();
  const outputs = history.flatMap(message => message.parts.flatMap(part =>
    part.type === "tool-searchDrugLabels" && part.state === "output-available" ? [part.output] : []));
  for (const output of outputs) {
    if ("excerpts" in output) for (const excerpt of output.excerpts) {
      refs.set(excerpt.id, excerpt.ref);
      excerpts.set(excerpt.ref, excerpt);
    }
  }
  let next = Math.max(0, ...excerpts.keys()) + 1;
  const register: CitationRegistry["register"] = label => {
    const ref = refs.get(label.id) ?? next++;
    refs.set(label.id, ref);
    const excerpt = { ...label, ref };
    excerpts.set(ref, excerpt);
    return excerpt;
  };
  for (const output of outputs) if ("docs" in output) output.sources.forEach((source, index) => {
    if (!refs.has(source.id)) register({ ...source, text: output.docs[index] ?? "" });
  });
  return { refs, excerpts, register };
}

const titleFields = new Set(["Drug_Name", "Manufacturer"]);
export function excerptFields(text: string): { label: string; value: string }[] {
  try {
    const data: unknown = JSON.parse(text);
    if (data && typeof data === "object" && !Array.isArray(data)) return Object.entries(data).flatMap(([key, value]) => {
      const content = typeof value === "string" ? value : Array.isArray(value) ? value.join(", ") : value == null ? "" : JSON.stringify(value);
      return titleFields.has(key) || !content.trim() ? [] : [{ label: key.replaceAll("_", " "), value: content.trim() }];
    });
  } catch {}
  return [{ label: "", value: text }];
}

export function citedRefs(text: string): number[] {
  const refs = new Set<number>();
  function visit(tokens: Token[]) {
    for (const token of tokens) {
      if (["code", "codespan", "link", "image", "html"].includes(token.type)) continue;
      if ("tokens" in token && Array.isArray(token.tokens)) visit(token.tokens);
      else if (token.type === "list") for (const item of token.items) visit(item.tokens);
      else if (token.type === "table") for (const row of [token.header, ...token.rows]) for (const cell of row) visit(cell.tokens);
      else if (token.type === "text") for (const match of token.text.matchAll(/\[(\d+)\](?!\()/g)) refs.add(Number(match[1]));
    }
  }
  visit(new Marked().lexer(text));
  return [...refs];
}
