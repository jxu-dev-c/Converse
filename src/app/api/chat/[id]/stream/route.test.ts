import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { POST } from "../stop/route";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), get: vi.fn(), resume: vi.fn(), stop: vi.fn() }));
vi.mock("@/app/_auth/validate-request", () => ({ validateRequest: mocks.auth }));
vi.mock("@/app/lib/redis", () => ({ redis: {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } limit = mocks.limit; } }));
vi.mock("@/app/lib/chat/store", () => ({ getChat: mocks.get }));
vi.mock("@/app/lib/chat/stream", () => ({ streamContext: { resumeExistingStream: mocks.resume }, stopActiveStream: mocks.stop }));
const context = { params: Promise.resolve({ id: "chat" }) };
const req = (method = "GET", body?: string, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/chat/chat/stream", { method, headers: { origin }, body });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "user" } }); mocks.limit.mockResolvedValue({ success: true }); mocks.get.mockResolvedValue({ meta: {} }); mocks.stop.mockResolvedValue(true); });
it("guards resume and stop with auth, origin and rate limits", async () => {
  for (const [handler, method] of [[GET, "GET"], [POST, "POST"]] as const) {
    expect((await handler(req(method, undefined, "https://foreign.example"), context)).status).toBe(403);
    mocks.auth.mockResolvedValue({ user: null });
    expect((await handler(req(method), context)).status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { id: "user" } }); mocks.limit.mockResolvedValue({ success: false, reset: Date.now() + 1000 });
    expect((await handler(req(method), context)).status).toBe(429);
    mocks.limit.mockResolvedValue({ success: true });
  }
});
it("returns 204 without an active stream and resumes an active one", async () => {
  expect((await GET(req(), context)).status).toBe(204);
  mocks.get.mockResolvedValue({ meta: { activeStreamId: "active" } });
  mocks.resume.mockResolvedValue(new ReadableStream({ start(controller) { controller.enqueue("data: test\n\n"); controller.close(); } }));
  const response = await GET(req(), context);
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  expect(await response.text()).toBe("data: test\n\n");
});
it("does not expose another user's chat", async () => {
  mocks.get.mockResolvedValue(null);
  expect((await GET(req(), context)).status).toBe(404);
  expect((await POST(req("POST"), context)).status).toBe(404);
  expect(mocks.get).toHaveBeenCalledWith("user", "chat");
});
it("rejects snapshots and waits for server persistence before confirming stop", async () => {
  expect((await POST(req("POST", JSON.stringify({ messages: [{ role: "assistant", content: "forged evidence" }] })), context)).status).toBe(400);
  expect(mocks.stop).not.toHaveBeenCalled();
  mocks.get.mockResolvedValue({ meta: { activeStreamId: "active" } });
  expect((await POST(req("POST"), context)).status).toBe(204);
  expect(mocks.stop).toHaveBeenCalledWith("user", "chat", "active");
  mocks.stop.mockResolvedValue(false);
  expect((await POST(req("POST"), context)).status).toBe(409);
});
