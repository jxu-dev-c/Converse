"use client";
import { useState } from "react";
import type { ChatMessage } from "@/app/lib/chat/types";
export type MessageHandlers = { onEdit: (text: string, messageId: string) => void; onRegenerate: () => void };
export function MessageActions({ message, last, disabled, onEdit, onRegenerate }: MessageHandlers & { message: ChatMessage; last: boolean; disabled: boolean }) {
  const text = message.parts.filter(part => part.type === "text").map(part => part.text).join("");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [copyStatus, setCopyStatus] = useState("");
  async function copy() { try { await navigator.clipboard.writeText(text); setCopyStatus("Copied"); } catch { setCopyStatus("Copy failed"); } }
  const button = "rounded px-2 py-1 text-xs hover:bg-zinc-200 focus-visible:outline focus-visible:outline-blue-500 disabled:opacity-40 dark:hover:bg-zinc-700";
  return <div className="mt-2">
    {editing && <form onSubmit={event => { event.preventDefault(); if (value.trim() && !disabled) { onEdit(value, message.id); setEditing(false); } }} className="space-y-2">
      <textarea aria-label="Edit message" className="w-full rounded-lg border p-3 dark:bg-zinc-700" rows={3} maxLength={3000} value={value} onChange={event => setValue(event.target.value)} />
      <button type="submit" className={button} disabled={disabled || !value.trim()}>Save edit</button><button type="button" className={button} onClick={() => setEditing(false)}>Cancel</button>
    </form>}
    <div className="flex gap-1 text-zinc-500 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
      <button className={button} onClick={() => { void copy(); }} aria-label="Copy message">{copyStatus || "Copy"}</button>
      {message.role === "user" ? <button className={button} disabled={disabled} onClick={() => { setValue(text); setEditing(true); }}>Edit</button> : last && <button className={button} disabled={disabled} onClick={onRegenerate}>Regenerate</button>}
    </div>
  </div>;
}
