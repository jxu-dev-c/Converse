import type { ChatMessage } from "./types";

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
    const size = messages[start - 1].parts.reduce((total, part) =>
      total + (part.type === "text" ? part.text.length : JSON.stringify(part).length), 0);
    if (chars + size > maxChars) break;
    chars += size;
    start--;
  }
  while (start < messages.length && messages[start].role !== "user") start++;
  return messages.slice(start);
}
