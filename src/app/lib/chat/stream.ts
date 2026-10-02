import { Redis } from "@upstash/redis";
import { createResumableStreamContext, type Publisher, type Subscriber } from "resumable-stream/generic";
import { after } from "next/server";
import { getChat } from "./store";

const rawRedis = Redis.fromEnv({ automaticDeserialization: false });
export async function subscribe(channel: string, callback: (message: string) => void): Promise<() => Promise<void>> {
  const subscription = rawRedis.subscribe<string>(channel);
  subscription.on("message", event => callback(event.message.startsWith("b64:") ? Buffer.from(event.message.slice(4), "base64").toString("utf8") : event.message));
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Subscription unavailable")), 5000);
      subscription.on("subscribe", () => { clearTimeout(timeout); resolve(); });
      subscription.on("error", () => { clearTimeout(timeout); reject(new Error("Subscription unavailable")); });
    });
  } catch (error) { await subscription.unsubscribe(); throw error; }
  subscription.on("error", () => console.error("Chat subscription failed"));
  return () => subscription.unsubscribe();
}
const subscriptions = new Map<string, () => Promise<void>>();
const subscriber: Subscriber = {
  connect: async () => {},
  subscribe: async (channel, callback) => { subscriptions.set(channel, await subscribe(channel, callback)); },
  unsubscribe: async channel => { const unsubscribe = subscriptions.get(channel); subscriptions.delete(channel); await unsubscribe?.(); },
};
const publisher: Publisher = {
  connect: async () => {}, publish: (channel, message) => rawRedis.publish(channel, `b64:${Buffer.from(message).toString("base64")}`),
  get: key => rawRedis.get<string | number>(key), incr: key => rawRedis.incr(key),
  set: (key, value, options) => options?.EX ? rawRedis.set(key, value, { ex: options.EX }) : rawRedis.set(key, value),
};
export const streamContext = createResumableStreamContext({
  keyPrefix: "converse:stream", waitUntil: promise => after(() => promise), subscriber, publisher,
});
export async function stopActiveStream(userId: string, chatId: string, streamId: string): Promise<boolean> {
  await rawRedis.publish(`converse:stop:${streamId}`, "stop");
  const deadline = Date.now() + 3000;
  do {
    const chat = await getChat(userId, chatId);
    if (chat?.meta.activeStreamId !== streamId) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return false;
}

// Upstash splits REST SSE messages at newlines; encode pub/sub payloads above and batch
// UI deltas here so resumed clients do not need a Redis publish for every model token.
export function batchSse(source: ReadableStream<string>): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      const reader = source.getReader();
      let buffer = "";
      const flush = () => { if (buffer) { controller.enqueue(buffer); buffer = ""; } };
      const timer = setInterval(flush, 50);
      try {
        while (true) { const { done, value } = await reader.read(); if (done) break; buffer += value; }
        flush(); controller.close();
      } catch { controller.error(new Error("Chat stream failed")); }
      finally { clearInterval(timer); reader.releaseLock(); }
    },
  });
}
