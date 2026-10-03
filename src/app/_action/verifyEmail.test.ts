import { beforeEach, expect, it, vi } from "vitest";
import { confirmEmail } from "./verifyEmail";
const mocks = vi.hoisted(() => ({ consume: vi.fn(), mark: vi.fn(), get: vi.fn(), session: vi.fn(), redirect: vi.fn() }));
vi.mock("@/app/_controller/user", () => ({ markEmailVerified: mocks.mark, getUserbyEmail: mocks.get }));
vi.mock("@/app/lib/auth/tokens", () => ({ consumeToken: mocks.consume }));
vi.mock("../_auth/session", () => ({ startSession: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
const form = () => { const data = new FormData(); data.set("token", "token"); return data; };
beforeEach(() => {
  vi.resetAllMocks(); mocks.consume.mockResolvedValue({ userId: "user-1", email: "test@example.com" }); mocks.get.mockResolvedValue({ Item: { id: "user-1", role: "user" } });
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
});
it("consumes, verifies and starts a session before redirecting", async () => {
  await expect(confirmEmail({}, form())).rejects.toThrow("redirect");
  expect(mocks.consume).toHaveBeenCalledWith("verify", "token"); expect(mocks.mark).toHaveBeenCalledWith("test@example.com", "user-1"); expect(mocks.mark).toHaveBeenCalledBefore(mocks.session);
  expect(mocks.session).toHaveBeenCalledWith({ id: "user-1", email: "test@example.com", role: "user" }); expect(mocks.redirect).toHaveBeenCalledWith("/chat");
});
it("rejects expired tokens without mutations or sessions", async () => {
  mocks.consume.mockResolvedValue(null); expect(await confirmEmail({}, form())).toEqual({ status: 400, message: "Link expired. Log in to get a new link." }); expect(mocks.mark).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
});
it("does not authenticate a replaced account", async () => {
  mocks.get.mockResolvedValue({ Item: { id: "other-user", role: "user" } }); expect((await confirmEmail({}, form())).status).toBe(400); expect(mocks.session).not.toHaveBeenCalled();
});
