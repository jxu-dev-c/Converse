"use client";
import { useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type ChatMessage } from "@/app/lib/chat/types";
import { Messages } from "./Messages";
import { useChatList } from "./ChatListProvider";
import NavBar from "@/components/navBar";
import ChatInput from "./ChatInput";

const transport = new DefaultChatTransport<ChatMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages }) => ({ body: { id, message: messages.at(-1) } }),
});

export const ChatWrapper = ({ chatId, initialMessages, resume = false }: {
  chatId: string;
  initialMessages: ChatMessage[];
  resume?: boolean;
}) => {
  const list = useChatList();
  const inputHeight = 55;
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error, stop } = useChat<ChatMessage>({
    id: chatId, messages: initialMessages, transport, resume,
    onData: part => { if (part.type === "data-title") list.upsert({ id: chatId, title: part.data.title }); },
  });
  const isLoading = status === "submitted" || status === "streaming";
  const chatState = isLoading ? "Loading" : error ? "Error" : messages.length ? "Finished" : "Ready";
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading || !input.trim()) return;
    history.replaceState(null, "", `/chat/${chatId}`);
    list.upsert({ id: chatId, updatedAt: Date.now() });
    void sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="relative min-h-full dark:bg-zinc-800 bg-zinc-200 flex flex-col justify-between">
      <NavBar />
      <div
        className="flex-1 text-black dark:bg-zinc-800 bg-gray-100 justify-between flex flex-col h-screen"
        style={{ paddingBottom: `${inputHeight * 1.3}px` }}
      >
        <Messages messages={messages} isStreaming={isLoading} />
      </div>
      <div
        className="w-full fixed bottom-0 left-0 right-0 bg-gray-100/75 dark:bg-zinc-800/75 backdrop-blur-md z-10"
        style={{ maxHeight: `${inputHeight * 1.3}px` }}
      >
        <div className="container mx-auto h-full">
          {error && <p role="alert" className="px-5 text-sm text-red-600">Unable to send your message. Please try again.</p>}
          <ChatInput
            chatState={chatState}
            input={input}
            inputHeight={inputHeight}
            onInputChange={event => setInput(event.target.value)}
            onSubmit={onSubmit}
            onStop={() => { void stop(); }}
          />
        </div>
      </div>
    </div>
  );
};
