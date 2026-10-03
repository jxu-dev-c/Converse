"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type ChatMessage } from "@/app/lib/chat/types";
import { Messages } from "./Messages";
import { useChatList } from "./ChatListProvider";
import NavBar from "./navBar";
import ChatInput from "./ChatInput";
const transport = new DefaultChatTransport<ChatMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages }) => ({ body: { id, message: messages.findLast(message => message.role === "user") } }),
});
export const ChatWrapper = ({ chatId, initialMessages, resume = false }: { chatId: string; initialMessages: ChatMessage[]; resume?: boolean }) => {
  const { upsert } = useChatList();
  const [input, setInput] = useState("");
  const [stopError, setStopError] = useState("");
  const { messages, sendMessage, regenerate, status, error, stop, clearError } = useChat<ChatMessage>({
    id: chatId, messages: initialMessages, transport, resume, experimental_throttle: 50,
    onData: part => { if (part.type === "data-title") upsert({ id: chatId, title: part.data.title }); },
  });
  const busy = status === "submitted" || status === "streaming";
  const spendingError = error?.message.startsWith("Weekly AI spending limit") || error?.message.startsWith("AI spending limits are temporarily unavailable");
  useEffect(() => { if (messages.length) upsert({ id: chatId, activeStreamId: busy ? "active" : undefined }); }, [busy, chatId, messages.length, upsert]);
  function send(text: string, messageId?: string) {
    if (busy || !text.trim()) return;
    history.replaceState(null, "", `/chat/${chatId}`);
    upsert({ id: chatId, updatedAt: Date.now(), activeStreamId: "active" });
    clearError(); setStopError("");
    void sendMessage({ text, ...(messageId ? { messageId } : {}) });
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!busy && input.trim()) { send(input); setInput(""); } }
  async function stopReply() {
    try {
      const response = await fetch(`/api/chat/${chatId}/stop`, { method: "POST" });
      if (!response.ok) throw new Error();
      await stop(); setStopError("");
    } catch { setStopError("Unable to stop the reply. Please try again."); }
  }
  return <div className="flex h-dvh min-w-0 flex-col bg-gray-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
    <NavBar />
    <Messages messages={messages} status={status} onSuggest={send} onEdit={send} onRegenerate={() => { clearError(); void regenerate(); }} />
    <div className="shrink-0 bg-gray-100/90 dark:bg-zinc-800/90">
      {stopError && <p role="alert" className="mx-auto max-w-3xl px-4 text-sm text-red-600">{stopError}</p>}
      {error && <div role="alert" className="mx-auto flex max-w-3xl items-center justify-between px-4 text-sm text-red-600"><span>{spendingError ? error.message : error.message.includes("Too many requests") || error.message.includes("429") ? "You're sending messages too quickly." : "Unable to send your message. Please try again."}</span>{!spendingError && <button onClick={() => { clearError(); void regenerate(); }} disabled={busy} className="rounded border px-3 py-1">Retry</button>}</div>}
      <ChatInput chatState={busy ? "Loading" : "Ready"} input={input} onInputChange={event => setInput(event.target.value)} onSubmit={submit} onStop={() => { void stopReply(); }} />
    </div>
  </div>;
};
