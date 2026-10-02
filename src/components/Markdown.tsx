"use client";
import { Marked } from "marked";
import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import type { Excerpt } from "@/app/lib/chat/citations";

const parser = new Marked({ async: false, gfm: true });
parser.use({ extensions: [{
  name: "citation", level: "inline",
  start: text => text.indexOf("["),
  tokenizer(text) {
    const match = /^\[(\d+)\](?!\(|\[)/.exec(text);
    if (match) return { type: "citation", raw: match[0], ref: match[1] };
  },
  renderer: token => `<sup><button type="button" class="citation-chip" data-citation="${token.ref}" aria-label="Source ${token.ref}">[${token.ref}]</button></sup>`,
}] });

export function Markdown({ content, citations }: { content: string; citations?: Map<number, Excerpt> }) {
  const html = useMemo(() => DOMPurify.sanitize(parser.parse(content, { async: false }) as string), [content]);
  const [active, setActive] = useState<Excerpt>();
  function show(target: EventTarget) {
    const ref = target instanceof Element ? target.closest("[data-citation]")?.getAttribute("data-citation") : null;
    setActive(ref ? citations?.get(Number(ref)) : undefined);
  }
  return <div className="relative min-w-0 break-words [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_a]:underline [&_.citation-chip]:text-blue-600 dark:[&_.citation-chip]:text-blue-400">
    <div onMouseOver={event => show(event.target)} onMouseLeave={() => setActive(undefined)} onFocus={event => show(event.target)} onBlur={() => setActive(undefined)} dangerouslySetInnerHTML={{ __html: html }} />
    {active && <div role="tooltip" className="absolute z-30 max-w-sm rounded-lg border bg-white p-3 text-sm shadow-lg dark:border-zinc-600 dark:bg-zinc-900"><strong>{active.title ?? "OTC label"}</strong><p>{active.text.slice(0, 240)}…</p></div>}
  </div>;
}
