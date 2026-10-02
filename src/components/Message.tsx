import { Icon } from "@iconify/react";
import { Markdown } from "./Markdown";
import { Sources } from "./Sources";
import type { Excerpt } from "@/app/lib/chat/citations";
import type { ChatMessage } from "@/app/lib/chat/types";
import { ToolActivity } from "./ToolActivity";

interface MessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  citations?: Map<number, Excerpt>;
}

export const Message = ({ message, isStreaming = false, citations = new Map() }: MessageProps) => {
  const isUserMessage = message.role === "user";
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
          ) : message.parts.map((part, index) => {
            if (part.type === "text") return <Markdown citations={citations} key={index} content={part.text} />;
            if (part.type === "tool-searchDrugLabels" || (part.type === "dynamic-tool" && part.toolName === "searchDrugLabels")) {
              return <ToolActivity key={part.toolCallId} part={part} isStreaming={isStreaming} />;
            }
            return null;
          })}
          {!isUserMessage && <Sources message={message} citations={citations} />}
        </div>
      </div>
    </div>
  );
};
