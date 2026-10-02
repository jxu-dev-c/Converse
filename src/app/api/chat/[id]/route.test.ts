import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH, DELETE } from "./route";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), rename: vi.fn(), delete: vi.fn() }));
vi.mock("@/app/_auth/validate-request", () => ({ validateRequest: mocks.auth }));
vi.mock("@/app/lib/redis", () => ({ redis: {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } limit = mocks.limit; } }));
vi.mock("@/app/lib/chat/store", () => ({ renameChat: mocks.rename, deleteChat: mocks.delete }));
const context = { params: Promise.resolve({ id: "chat" }) };
const request = (method: string, body?: unknown, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/chat/chat", { method, headers: { origin }, ...(body ? { body: JSON.stringify(body) } : {}) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "user" } }); mocks.limit.mockResolvedValue({ success: true }); mocks.rename.mockResolvedValue(true); mocks.delete.mockResolvedValue(1); });
it("requires auth and origin on both management routes", async () => {
  for (const [handler, method] of [[PATCH, "PATCH"], [DELETE, "DELETE"]] as const) {
    expect((await handler(request(method, undefined, "https://foreign.example"), context)).status).toBe(403);
    mocks.auth.mockResolvedValue({ user: null });
    expect((await handler(request(method), context)).status).toBe(401);
  }
});
it("trims and validates titles", async () => {
  expect((await PATCH(request("PATCH", { title: " New title " }), context)).status).toBe(200);
  expect(mocks.rename).toHaveBeenCalledWith("user", "chat", "New title");
  for (const title of [" ", "x".repeat(81)]) expect((await PATCH(request("PATCH", { title }), context)).status).toBe(400);
});
it("returns not found for another user's chat and refuses active deletion", async () => {
  mocks.rename.mockResolvedValue(false); mocks.delete.mockResolvedValue(0);
  expect((await PATCH(request("PATCH", { title: "Title" }), context)).status).toBe(404);
  expect((await DELETE(request("DELETE"), context)).status).toBe(404);
  mocks.delete.mockResolvedValue(-1);
  expect((await DELETE(request("DELETE"), context)).status).toBe(409);
});
