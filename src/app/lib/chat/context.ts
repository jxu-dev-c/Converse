import type { ChatMessage } from "./types";

export function mergeIncoming(history: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = history.findIndex(stored => stored.id === message.id);
  return [...(index === -1 ? history : history.slice(0, index)), message];
}

export function prepareHistory(
  messages: ChatMessage[],
  { maxMessages = 40, maxTokens = 12_000 } = {},
): ChatMessage[] {
  const users = messages.flatMap((message, index) => message.role === "user" ? [index] : []);
  const recentStart = users.at(-3) ?? 0;
  const prepared = messages.map((message, index) => ({ ...message, parts: message.parts.filter(part =>
    part.type !== "reasoning" && !(message.role === "assistant" && index < recentStart
      && (part.type.startsWith("tool-") || part.type === "dynamic-tool"))),
  }));
  let start = prepared.length;
  let tokens = 0;
  while (start > 0 && prepared.length - start < maxMessages) {
    const size = prepared[start - 1].parts.reduce((total, part) => total + JSON.stringify(part).length / 4, 0);
    if (tokens + size > maxTokens) break;
    tokens += size;
    start--;
  }
  while (start < prepared.length && prepared[start].role !== "user") start++;
  return prepared.slice(start);
}
