import { createCitationRegistry } from "@/app/lib/chat/citations";
import type { ChatMessage } from "@/app/lib/chat/types";
import { Message } from "./Message";
import { Icon } from "@iconify/react";
import { useEffect, useRef } from "react";

interface MessageProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
}

export const Messages = ({ messages, isStreaming = false }: MessageProps) => {
  const messagesContainer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // check the y-axis of the last message,
    // if it is greater than the 97% height of the messages container
    // if it is, scroll to the bottom
    if (messagesContainer.current) {
      const current = messagesContainer.current;
      const lastMessage = current.lastElementChild;
      if (lastMessage) {
        const lastMessageY = lastMessage.getBoundingClientRect().top;
        const windowHeight = window.innerHeight;
        if (lastMessageY > 0.6 * windowHeight) {
          lastMessage.scrollIntoView(true);
          // current.scrollBy(0, 100);
        }
      }
    }
  }, [messages]);
  return (
    // <ScrollShadow size={20} className="h-[85vh] w-screen" hideScrollBar>
      <div
        className="flex min-h-[calc(100vh-64px-120px)] flex-1 flex-col bg-gray-100 dark:bg-zinc-800 overflow-y-auto"
        ref={messagesContainer}
      >
        {messages.length > 0 ? (
          messages.map((message, index) => (
            <Message
              citations={createCitationRegistry(messages).excerpts}
              key={message.id}
              message={message}
              isStreaming={isStreaming && message.role === "assistant" && index === messages.length - 1}
            />
          ))
        ) : (
          <div className=" place-self-center self-center my-auto">
            <div className="flex flex-col items-center gap-3">
              <Icon icon="flat-color-icons:sms" className="size-20" />
              <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-200">
                Ready To Go!
              </h3>
              <div className="text-gray-800 font-light dark:text-gray-400 inline-block max-w-[200px] text-center">
                Type In the Text Field Below to Send Your First Message
              </div>
            </div>
          </div>
        )}
      </div>
    // </ScrollShadow>
  );
};
