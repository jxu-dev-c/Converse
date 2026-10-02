import type { ModelMessage } from "ai";
import type { ChatMessage } from "./types";

export function messageText(message: ChatMessage): string {
  return message.parts.filter(part => part.type === "text").map(part => part.text).join("");
}

export function mergeIncoming(history: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = history.findIndex(stored => stored.id === message.id);
  return [...(index === -1 ? history : history.slice(0, index)), message];
}

export function selectHistoryWindow(
  messages: ChatMessage[],
  { maxMessages = 24, maxChars = 24_000 } = {},
): ChatMessage[] {
  let start = messages.length;
  let chars = 0;
  while (start > 0 && messages.length - start < maxMessages) {
    const size = messageText(messages[start - 1]).length;
    if (chars + size > maxChars) break;
    chars += size;
    start--;
  }
  while (start < messages.length && messages[start].role !== "user") start++;
  return messages.slice(start);
}

export function withReferenceMaterial(messages: ModelMessage[], docs: string[]): ModelMessage[] {
  const latestUserIndex = messages.findLastIndex(message => message.role === "user");
  return messages.map((message, index) => {
    if (index !== latestUserIndex || message.role !== "user") return message;
    const reference = `<reference_material>\n${JSON.stringify(docs)}\n</reference_material>\n\n`;
    if (typeof message.content === "string") {
      return { ...message, content: reference + message.content };
    }
    return { ...message, content: [{ type: "text" as const, text: reference }, ...message.content] };
  });
}
