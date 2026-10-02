import { citedRefs, createCitationRegistry, type Excerpt } from "@/app/lib/chat/citations";
import type { ChatMessage } from "@/app/lib/chat/types";
export function Sources({ message, citations }: { message: ChatMessage; citations: Map<number, Excerpt> }) {
  const text = message.parts.filter(part => part.type === "text").map(part => part.text).join("");
  const refs = citedRefs(text);
  const fallback = createCitationRegistry([message]).excerpts;
  const sources = (refs.length ? refs : [...fallback.keys()]).flatMap(ref => {
    const source = citations.get(ref) ?? fallback.get(ref);
    return source ? [source] : [];
  });
  if (!sources.length) return null;
  return <footer className="border-t border-zinc-300 pt-2 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400" aria-label="Sources">
    <p className="font-medium">Sources</p>
    {sources.map(source => <p key={source.ref}>[{source.ref}] {source.title ?? "OTC label"}</p>)}
  </footer>;
}
