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

export function citedRefs(text: string): number[] {
  return [...new Set(Array.from(text.matchAll(/\[(\d+)\](?!\()/g), match => Number(match[1])))];
}
