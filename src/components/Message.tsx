import { Icon } from "@iconify/react";
import { Markdown } from "./Markdown";
import { Sources } from "./Sources";
import type { Excerpt } from "@/app/lib/chat/citations";
import type { ChatMessage } from "@/app/lib/chat/types";
import { AgentActivity } from "./AgentActivity";

interface MessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  citations?: Map<number, Excerpt>;
}

export const Message = ({ message, isStreaming = false, citations = new Map() }: MessageProps) => {
  const isUserMessage = message.role === "user";
  const groups: ChatMessage["parts"][] = [];
  for (const part of message.parts) {
    if (part.type === "text") groups.push([part]);
    else if (groups.at(-1)?.[0]?.type !== "text" && groups.length) groups.at(-1)!.push(part);
    else groups.push([part]);
  }
  return (
    <div className={"p-6 message"}>
      <div
        className={`max-w-3xl mx-auto flex items-start justify-start ${
          isUserMessage ? "flex-row-reverse" : ""
        } gap-2.5`}
      >
        <div className="bg-white dark:bg-gray-500 p-3 rounded-[50%] border-neutral-300/50 border-2">
          <Icon
            icon={`${
              isUserMessage
                ? "fluent:person-20-regular"
                : "fluent:bot-20-regular"
            }`}
            width="1.5em"
            height="1.5em"
            className="text-black dark:text-white"
          />
        </div>
        <div className="min-w-0 space-y-3">
          {isUserMessage ? (
            <Markdown citations={citations} content={message.parts.filter(part => part.type === "text").map(part => part.text).join("")} />
          ) : groups.map((parts, index) => {
            if (parts[0].type === "text") return <Markdown citations={citations} key={index} content={parts[0].text} />;
            return <AgentActivity key={index} parts={parts} running={isStreaming && index === groups.length - 1} reasoningMs={message.metadata?.reasoningMs} />;
          })}
          {!isUserMessage && <Sources message={message} citations={citations} />}
        </div>
      </div>
    </div>
  );
};
