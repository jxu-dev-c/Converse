import { beforeEach, expect, it, vi } from "vitest";
import { clearChat, loadChat, saveChat } from "./store";
import type { ChatMessage } from "./types";

const redis = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
vi.mock("../redis", () => ({ redis }));
beforeEach(() => vi.clearAllMocks());

it("uses a stable per-user key and returns an empty new conversation", async () => {
  redis.get.mockResolvedValue(null);
  expect(await loadChat("user-id")).toEqual([]);
  expect(redis.get).toHaveBeenCalledWith("chat:user-id:default");
});
it("bounds stored history and sets the 30-day expiry", async () => {
  const messages: ChatMessage[] = Array.from({ length: 205 }, (_, index) => ({
    id: String(index), role: index % 2 ? "assistant" : "user", parts: [{ type: "text", text: String(index) }],
  }));
  await saveChat("user-id", messages);
  expect(redis.set).toHaveBeenCalledWith("chat:user-id:default", messages.slice(6), { ex: 2592000 });
  expect(messages).toHaveLength(205);
});
it("deletes only the authenticated user's conversation", async () => {
  await clearChat("user-id");
  expect(redis.del).toHaveBeenCalledWith("chat:user-id:default");
});
