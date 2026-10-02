import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ options: null as unknown, publish: vi.fn(), subscribers: [] as unknown[] }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./store", () => ({ getChat: vi.fn() }));
vi.mock("resumable-stream/generic", () => ({ createResumableStreamContext: (options: unknown) => { mocks.options = options; return {}; } }));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({
  publish: mocks.publish, get: vi.fn(), incr: vi.fn(), set: vi.fn(),
  subscribe: () => { const subscription = new EventEmitter(); Object.assign(subscription, { unsubscribe: vi.fn() }); mocks.subscribers.push(subscription); queueMicrotask(() => subscription.emit("subscribe", 1)); return subscription; },
}) } }));
import { batchSse, subscribe } from "./stream";
import type { Publisher } from "resumable-stream/generic";
beforeEach(() => { mocks.publish.mockClear(); mocks.subscribers.length = 0; });
it("preserves multiline SSE bytes through REST pub/sub and waits for subscribe acknowledgement", async () => {
  const payload = 'data: {"type":"text-delta","delta":"héllo"}\n\n';
  const callback = vi.fn();
  const unsubscribe = await subscribe("channel", callback);
  const { publisher } = mocks.options as { publisher: Publisher };
  await publisher.publish("channel", payload);
  const encoded = mocks.publish.mock.calls[0][1];
  expect(encoded).not.toContain("\n");
  (mocks.subscribers[0] as EventEmitter).emit("message", { message: encoded, channel: "channel" });
  expect(callback).toHaveBeenCalledWith(payload);
  await unsubscribe();
});
it("batches deltas without altering stream contents", async () => {
  const source = new ReadableStream<string>({ start(controller) { controller.enqueue("first\n\n"); controller.enqueue("second\n\n"); controller.close(); } });
  const reader = batchSse(source).getReader();
  expect(await reader.read()).toEqual({ done: false, value: "first\n\nsecond\n\n" });
  expect((await reader.read()).done).toBe(true);
});
