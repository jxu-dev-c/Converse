"use client";
import type { ChatMessage } from "@/app/lib/chat/types";
import type { Excerpt } from "@/app/lib/chat/citations";
import { Markdown } from "./Markdown";
import { Sources } from "./Sources";
import { AgentActivity } from "./AgentActivity";
import { MessageActions, type MessageHandlers } from "./MessageActions";
export const Message = ({ message, isStreaming = false, citations, last, disabled, ...handlers }: MessageHandlers & {
  message: ChatMessage; isStreaming?: boolean; citations: Map<number, Excerpt>; last: boolean; disabled: boolean;
}) => {
  const isUser = message.role === "user";
  const groups: ChatMessage["parts"][] = [];
  for (const part of message.parts) {
    if (part.type !== "text" && part.type !== "reasoning" && part.type !== "tool-searchDrugLabels" && !(part.type === "dynamic-tool" && part.toolName === "searchDrugLabels")) continue;
    if (part.type === "text") groups.push([part]);
    else if (groups.at(-1)?.[0]?.type !== "text" && groups.length) groups.at(-1)!.push(part);
    else groups.push([part]);
  }
  return <article className={`group mx-auto w-full max-w-3xl px-4 py-5 ${isUser ? "flex flex-col items-end" : ""}`} aria-label={`${isUser ? "User" : "Assistant"} message`}>
    <div className={isUser ? "max-w-[90%] whitespace-pre-wrap break-words rounded-2xl bg-zinc-200 px-4 py-2 dark:bg-zinc-700" : "w-full space-y-3"}>
      {isUser ? message.parts.filter(part => part.type === "text").map(part => part.text).join("") : groups.map((parts, index) => {
        if (parts[0].type === "text") return <Markdown key={index} citations={citations} content={parts[0].text} />;
        return <AgentActivity key={index} parts={parts} running={isStreaming && index === groups.length - 1} reasoningMs={message.metadata?.reasoningMs} />;
      })}
      {!isUser && <Sources message={message} citations={citations} />}
    </div>
    <MessageActions message={message} last={last} disabled={disabled} {...handlers} />
  </article>;
};
