"use client";
import { Marked } from "marked";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import DOMPurify from "dompurify";
import type { Excerpt } from "@/app/lib/chat/citations";

const parser = new Marked({ async: false, gfm: true });
parser.use({ extensions: [{
  name: "citation", level: "inline",
  start: text => text.indexOf("["),
  tokenizer(text) {
    const match = /^\[(\d+)\](?!\()/.exec(text);
    if (match) return { type: "citation", raw: match[0], ref: match[1] };
  },
  renderer: token => `<sup><button type="button" class="citation-chip" data-citation="${token.ref}" aria-label="Source ${token.ref}">[${token.ref}]</button></sup>`,
}] });

const subscribeToHydration = () => () => {};

export function Markdown({ content, citations }: { content: string; citations?: Map<number, Excerpt> }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const html = useMemo(() => hydrated ? DOMPurify.sanitize(parser.parse(content, { async: false }) as string) : "", [content, hydrated]);
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ excerpt: Excerpt; top: number; left: number }>();
  function show(target: EventTarget) {
    const chip = target instanceof Element ? target.closest("[data-citation]") : null;
    const excerpt = chip ? citations?.get(Number(chip.getAttribute("data-citation"))) : undefined;
    if (!chip || !excerpt || !container.current) return setActive(undefined);
    const bounds = container.current.getBoundingClientRect(), anchor = chip.getBoundingClientRect();
    setActive({ excerpt, top: anchor.bottom - bounds.top + 4, left: Math.max(0, Math.min(anchor.left - bounds.left, bounds.width - 384)) });
  }
  return <div ref={container} className="relative min-w-0 break-words [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_a]:underline [&_.citation-chip]:inline-block [&_.citation-chip]:leading-normal [&_.citation-chip]:text-blue-600 dark:[&_.citation-chip]:text-blue-400">
    <div onMouseOver={event => show(event.target)} onMouseLeave={() => setActive(undefined)} onFocus={event => show(event.target)} onBlur={() => setActive(undefined)} dangerouslySetInnerHTML={{ __html: html }} />
    {active && <div role="tooltip" style={{ top: active.top, left: active.left }} className="pointer-events-none absolute z-30 w-96 max-w-full rounded-lg border bg-white p-3 text-sm shadow-lg dark:border-zinc-600 dark:bg-zinc-900"><strong>{active.excerpt.title ?? "OTC label"}</strong><p>{active.excerpt.text.slice(0, 240)}…</p></div>}
  </div>;
}
