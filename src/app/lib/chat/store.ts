import { redis } from "../redis";
import { CHAT_ID, type ChatMessage, type ChatSummary } from "./types";

export const CHAT_TTL_SECONDS = 30 * 24 * 60 * 60;
const chatKey = (userId: string, chatId: string) => `chat:${userId}:${chatId}`;
const metaKey = (userId: string, chatId: string) => `${chatKey(userId, chatId)}:meta`;
const indexKey = (userId: string) => `chats:${userId}`;
export type ChatMeta = Omit<ChatSummary, "id">;

export async function loadChat(userId: string, chatId = CHAT_ID): Promise<ChatMessage[]> {
  return await redis.get<ChatMessage[]>(chatKey(userId, chatId)) ?? [];
}
export async function getChat(userId: string, chatId: string) {
  const meta = await redis.hgetall<ChatMeta>(metaKey(userId, chatId));
  return meta ? { meta, messages: await loadChat(userId, chatId) } : null;
}
const trimIndex = `
local excess = redis.call('zcard', KEYS[3]) - 100
if excess > 0 then
  local old = redis.call('zrange', KEYS[3], 0, excess - 1)
  for _, id in ipairs(old) do
    redis.call('del', ARGV[5] .. id, ARGV[5] .. id .. ':meta')
    redis.call('zrem', KEYS[3], id)
  end
end
`;
export async function touchChat(userId: string, chatId: string, title = "New chat"): Promise<boolean> {
  return !!await redis.eval(`
local created = redis.call('exists', KEYS[2]) == 0
if created then
  redis.call('hset', KEYS[2], 'title', ARGV[1], 'createdAt', ARGV[2], 'updatedAt', ARGV[2])
  redis.call('set', KEYS[1], '[]', 'NX', 'EX', ARGV[3])
end
redis.call('expire', KEYS[2], ARGV[3])
redis.call('zadd', KEYS[3], ARGV[2], ARGV[4])
${trimIndex}
return created and 1 or 0`, [chatKey(userId, chatId), metaKey(userId, chatId), indexKey(userId)],
    [title, Date.now(), CHAT_TTL_SECONDS, chatId, `chat:${userId}:`]);
}
function retain(messages: ChatMessage[]) {
  const retained = messages.slice(-200);
  while (retained.length && retained[0].role !== "user") retained.shift();
  return retained;
}
const saveScript = `
if redis.call('exists', KEYS[2]) == 0 then return 0 end
if ARGV[6] ~= '' and redis.call('hget', KEYS[2], 'activeStreamId') ~= ARGV[6] then return 0 end
redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('hset', KEYS[2], 'updatedAt', ARGV[2])
if ARGV[6] ~= '' then redis.call('hdel', KEYS[2], 'activeStreamId') end
redis.call('expire', KEYS[2], ARGV[3])
redis.call('zadd', KEYS[3], ARGV[2], ARGV[4])
${trimIndex}
return 1`;
export async function saveChatIfActive(userId: string, chatId: string, streamId: string, messages: ChatMessage[]): Promise<boolean> {
  return !!await redis.eval(saveScript, [chatKey(userId, chatId), metaKey(userId, chatId), indexKey(userId)],
    [JSON.stringify(retain(messages)), Date.now(), CHAT_TTL_SECONDS, chatId, `chat:${userId}:`, streamId]);
}
export async function saveChat(userId: string, messages: ChatMessage[], chatId = CHAT_ID) {
  await saveChatIfActive(userId, chatId, "", messages);
}
export async function renameChat(userId: string, chatId: string, title: string) {
  return !!await redis.eval(`
if redis.call('exists', KEYS[1]) == 0 then return 0 end
redis.call('hset', KEYS[1], 'title', ARGV[1])
return 1`, [metaKey(userId, chatId)], [title]);
}
export async function deleteChat(userId: string, chatId: string) {
  return Number(await redis.eval(`
if redis.call('hget', KEYS[2], 'activeStreamId') then return -1 end
local existed = redis.call('exists', KEYS[2])
redis.call('del', KEYS[1], KEYS[2])
redis.call('zrem', KEYS[3], ARGV[1])
return existed`, [chatKey(userId, chatId), metaKey(userId, chatId), indexKey(userId)], [chatId]));
}
export async function listChats(userId: string): Promise<ChatSummary[]> {
  let ids = await redis.zrange<string[]>(indexKey(userId), 0, -1, { rev: true });
  if (!ids.length) {
    const legacy = await loadChat(userId);
    if (legacy.length) {
      const first = legacy.find(message => message.role === "user");
      const title = first?.parts.filter(part => part.type === "text").map(part => part.text).join("").slice(0, 60) || "New chat";
      await touchChat(userId, CHAT_ID, title);
      ids = [CHAT_ID];
    }
  }
  const chats = await Promise.all(ids.map(async id => {
    const meta = await redis.hgetall<ChatMeta>(metaKey(userId, id));
    if (!meta) { await redis.zrem(indexKey(userId), id); return null; }
    return { ...meta, createdAt: Number(meta.createdAt), updatedAt: Number(meta.updatedAt), id };
  }));
  return chats.filter((chat): chat is ChatSummary => chat !== null);
}
