import { beforeEach, expect, it, vi } from "vitest";
import { deleteChat, getChat, listChats, loadChat, renameChat, saveChatIfActive, touchChat } from "./store";
import type { ChatMessage } from "./types";
const redis = vi.hoisted(() => ({ get: vi.fn(), eval: vi.fn(), hgetall: vi.fn(), zrange: vi.fn(), zrem: vi.fn() }));
vi.mock("../redis", () => ({ redis }));
beforeEach(() => { vi.resetAllMocks(); redis.eval.mockResolvedValue(1); redis.get.mockResolvedValue(null); });
it("uses user-scoped message and metadata keys", async () => {
  expect(await loadChat("user-id")).toEqual([]);
  expect(redis.get).toHaveBeenCalledWith("chat:user-id:default");
  redis.hgetall.mockResolvedValue(null);
  expect(await getChat("other-user", "default")).toBeNull();
});
it("creates a chat atomically and caps its index at 100", async () => {
  expect(await touchChat("user", "new", "Title")).toBe(true);
  const [script, keys, args] = redis.eval.mock.calls[0];
  expect(keys).toEqual(["chat:user:new", "chat:user:new:meta", "chats:user"]);
  expect(script).toContain("- 100");
  expect(args).toEqual(["Title", expect.any(Number), 2592000, "new", "chat:user:"]);
  redis.eval.mockResolvedValue(0);
  expect(await touchChat("user", "new")).toBe(false);
});
it("orders listings, removes expired metadata, and backfills legacy default history", async () => {
  redis.zrange.mockResolvedValue(["recent", "expired", "old"]);
  redis.hgetall.mockResolvedValueOnce({ title: "Recent", updatedAt: 3, createdAt: 1 }).mockResolvedValueOnce(null).mockResolvedValueOnce({ title: "Old", updatedAt: 2, createdAt: 1 });
  expect((await listChats("user")).map(chat => chat.id)).toEqual(["recent", "old"]);
  expect(redis.zrange).toHaveBeenCalledWith("chats:user", 0, -1, { rev: true });
  expect(redis.zrem).toHaveBeenCalledWith("chats:user", "expired");
  redis.zrange.mockResolvedValue([]);
  redis.get.mockResolvedValue([{ id: "u", role: "user", parts: [{ type: "text", text: "Legacy question" }] }]);
  redis.hgetall.mockResolvedValue({ title: "Legacy question", updatedAt: 1, createdAt: 1 });
  expect((await listChats("user"))[0].id).toBe("default");
  expect(redis.eval.mock.calls.at(-1)?.[2][0]).toBe("Legacy question");
});
it("renames existing chats, rejects active deletion, and scopes deletion", async () => {
  expect(await renameChat("user", "chat", "Renamed")).toBe(true);
  expect(redis.eval.mock.calls[0][1]).toEqual(["chat:user:chat:meta"]);
  redis.eval.mockResolvedValue(-1);
  expect(await deleteChat("user", "chat")).toBe(-1);
  expect(redis.eval.mock.calls[1][1]).toEqual(["chat:user:chat", "chat:user:chat:meta", "chats:user"]);
});
it("bounds persistence, refreshes both TTLs, and skips stale streams", async () => {
  const messages: ChatMessage[] = Array.from({ length: 205 }, (_, index) => ({ id: String(index), role: index % 2 ? "assistant" : "user", parts: [{ type: "text", text: String(index) }] }));
  expect(await saveChatIfActive("user", "chat", "active", messages)).toBe(true);
  const [script, , args] = redis.eval.mock.calls[0];
  expect(JSON.parse(args[0])).toEqual(messages.slice(6));
  expect(args[2]).toBe(2592000);
  expect(args[5]).toBe("active");
  expect(script).toContain("'activeStreamId') ~= ARGV[6]");
  expect(script).toContain("redis.call('expire', KEYS[2], ARGV[3])");
  redis.eval.mockResolvedValue(0);
  expect(await saveChatIfActive("user", "chat", "stale", messages)).toBe(false);
});
