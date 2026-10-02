import { Icon } from "@iconify/react";
import { marked } from "marked";
import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import type { ChatMessage } from "@/app/lib/chat/types";
import { ToolActivity } from "./ToolActivity";

interface MessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

marked.use({
  async: true,
  gfm: true,
  breaks: false,
});

function MarkdownContent({ content, isUserMessage = false }: { content: string; isUserMessage?: boolean }) {
  const [parsedHTML, setParsedHTML] = useState("");
  useEffect(() => {
    let current = true;
    (async () => {
      const html = await marked.parse(content);
      const cleaned = DOMPurify.sanitize(html);
      if (current) setParsedHTML(cleaned);
    })();
    return () => { current = false; };
  }, [content]);
  if (!content) return null;
  return (
    <div
      className={`p-3 rounded-md ${isUserMessage ? "bg-green-400" : "bg-blue-400"}`}
      dangerouslySetInnerHTML={{ __html: parsedHTML as string | TrustedHTML }}
    />
  );
}

export const Message = ({ message, isStreaming = false }: MessageProps) => {
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
            <MarkdownContent isUserMessage content={message.parts.filter(part => part.type === "text").map(part => part.text).join("")} />
          ) : message.parts.map((part, index) => {
            if (part.type === "text") return <MarkdownContent key={index} content={part.text} />;
            if (part.type === "tool-searchDrugLabels" || (part.type === "dynamic-tool" && part.toolName === "searchDrugLabels")) {
              return <ToolActivity key={part.toolCallId} part={part} isStreaming={isStreaming} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
