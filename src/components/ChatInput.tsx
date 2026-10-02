"use client";
import { useLayoutEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@nextui-org/react";
import { ArrowUp, Square } from "lucide-react";
export interface ChatInputProps {
  chatState: string; input: string;
  onInputChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
}
export default function ChatInput({ chatState, input, onInputChange, onSubmit, onStop }: ChatInputProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const isLoading = chatState === "Loading";
  useLayoutEffect(() => {
    const element = textarea.current;
    if (element) { element.style.height = "auto"; element.style.height = `${Math.min(216, element.scrollHeight)}px`; }
  }, [input]);
  return <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl items-end gap-3 px-3 pb-4 pt-2">
    <div className="min-w-0 flex-1"><textarea ref={textarea} rows={1} maxLength={3000} aria-label="Message" placeholder="Ask about OTC drug labels…" value={input} onChange={onInputChange}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); if (!isLoading && input.trim()) event.currentTarget.form?.requestSubmit(); } }}
      className="block max-h-[216px] w-full resize-none rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-black outline-none focus:border-blue-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white" />
      {input.length >= 2700 && <p className="mt-1 text-right text-xs text-zinc-500">{input.length}/3000</p>}
    </div>
    <Button isIconOnly color="primary" type={isLoading ? "button" : "submit"} aria-label={isLoading ? "Stop generating" : "Send message"} isDisabled={!isLoading && !input.trim()} onPress={isLoading ? onStop : undefined}>
      {isLoading ? <Square size={18} /> : <ArrowUp size={20} />}
    </Button>
  </form>;
}
