import { redis } from "../redis";
import { CHAT_ID, type ChatMessage } from "./types";

const MAX_STORED_MESSAGES = 200;
const CHAT_TTL_SECONDS = 30 * 24 * 60 * 60;
const chatKey = (userId: string, chatId: string) => `chat:${userId}:${chatId}`;

export async function loadChat(userId: string, chatId = CHAT_ID): Promise<ChatMessage[]> {
  return await redis.get<ChatMessage[]>(chatKey(userId, chatId)) ?? [];
}

export async function saveChat(userId: string, messages: ChatMessage[], chatId = CHAT_ID): Promise<void> {
  const retained = messages.slice(-MAX_STORED_MESSAGES);
  // Never retain a leading assistant whose user turn has been evicted.
  while (retained.length && retained[0].role !== "user") retained.shift();
  await redis.set(chatKey(userId, chatId), retained, { ex: CHAT_TTL_SECONDS });
}

export async function clearChat(userId: string, chatId = CHAT_ID): Promise<void> {
  await redis.del(chatKey(userId, chatId));
}
