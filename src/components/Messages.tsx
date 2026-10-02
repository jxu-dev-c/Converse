"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createCitationRegistry } from "@/app/lib/chat/citations";
import type { ChatMessage } from "@/app/lib/chat/types";
import { Message } from "./Message";
import type { MessageHandlers } from "./MessageActions";
const suggestions = ["What is ibuprofen used for?", "What warnings are on diphenhydramine labels?", "What is the adult dose of loratadine?", "What is the maximum daily dose of acetaminophen?"];
export const Messages = ({ messages, status, onSuggest, ...handlers }: MessageHandlers & {
  messages: ChatMessage[]; status: string; onSuggest: (text: string) => void;
}) => {
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const touchY = useRef(0);
  const following = useRef(true);
  const [nearBottom, setNearBottom] = useState(true);
  const citations = useMemo(() => createCitationRegistry(messages).excerpts, [messages]);
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (!sentinel.current) return;
    const observer = new IntersectionObserver(([entry]) => { following.current = entry.isIntersecting; setNearBottom(entry.isIntersecting); }, { root: container.current, rootMargin: "0px 0px 100px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { if (following.current) sentinel.current?.scrollIntoView({ block: "end" }); }, [messages, status]);
  useEffect(() => {
    if (!content.current) return;
    const observer = new ResizeObserver(() => { if (following.current) sentinel.current?.scrollIntoView({ block: "end" }); });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  return <div className="relative flex min-h-0 flex-1 flex-col">
    <div ref={container} className="flex-1 overflow-y-auto" aria-label="Chat messages" tabIndex={0}
      onWheel={event => { if (event.deltaY < 0) { following.current = false; setNearBottom(false); } }}
      onTouchStart={event => { touchY.current = event.touches[0].clientY; }}
      onTouchMove={event => { if (event.touches[0].clientY > touchY.current) { following.current = false; setNearBottom(false); } touchY.current = event.touches[0].clientY; }}
      onKeyDown={event => { if (["PageUp", "Home", "ArrowUp"].includes(event.key)) { following.current = false; setNearBottom(false); } }}>

      <div ref={content}>
      {messages.length ? messages.map((message, index) => <Message key={message.id} message={message} citations={citations} last={index === messages.length - 1} disabled={busy} isStreaming={busy && index === messages.length - 1 && message.role === "assistant"} {...handlers} />)
        : <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-4 px-5 py-12"><h1 className="text-2xl font-semibold">What would you like to research?</h1><p className="text-sm text-zinc-600 dark:text-zinc-400">Explore openFDA OTC drug labels. For research only, not medical advice.</p><div className="grid gap-2 sm:grid-cols-2">{suggestions.map(text => <button key={text} onClick={() => onSuggest(text)} className="rounded-xl border border-zinc-300 p-3 text-left text-sm hover:bg-zinc-200 dark:border-zinc-600 dark:hover:bg-zinc-700">{text}</button>)}</div></div>}
      {status === "submitted" && <p role="status" className="mx-auto max-w-3xl animate-pulse px-4 py-5 text-sm text-zinc-500">Thinking…</p>}
      <div ref={sentinel} className="h-px" />
      </div>
    </div>
    {!nearBottom && <button onClick={() => { following.current = true; sentinel.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-white px-4 py-2 text-sm shadow-md dark:border-zinc-600 dark:bg-zinc-900">Jump to latest</button>}
  </div>;
};
