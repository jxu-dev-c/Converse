import { beforeEach, expect, it, vi } from "vitest";
import { requestPasswordReset, resetPassword } from "./passwordReset";

const mocks = vi.hoisted(() => ({
  callbacks: [] as (() => Promise<void>)[], get: vi.fn(), hash: vi.fn(), update: vi.fn(),
  ip: vi.fn(), email: vi.fn(), consume: vi.fn(), create: vi.fn(), send: vi.fn(),
  invalidate: vi.fn(), session: vi.fn(), redirect: vi.fn(),
}));
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => mocks.callbacks.push(callback) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/_controller/user", () => ({ getUserbyEmail: mocks.get, hashPassword: mocks.hash, updatePassword: mocks.update }));
vi.mock("../_auth/lucia", () => ({ lucia: { invalidateUserSessions: mocks.invalidate } }));
vi.mock("../_auth/session", () => ({ startSession: mocks.session }));
vi.mock("@/app/lib/auth/limits", () => ({ clientIp: async () => "127.0.0.1", resetIpLimit: { limit: mocks.ip }, resetEmailLimit: { limit: mocks.email } }));
vi.mock("@/app/lib/auth/tokens", () => ({ consumeToken: mocks.consume, createToken: mocks.create }));
vi.mock("@/app/lib/auth/email", () => ({ sendPasswordResetEmail: mocks.send }));
const payload = { userId: "user-1", email: "test@example.com" };
const form = (values: Record<string, string>) => { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; };
const resetForm = () => form({ token: "token", password: "StrongPass1" });
beforeEach(() => {
  vi.resetAllMocks(); mocks.callbacks.length = 0;
  mocks.ip.mockResolvedValue({ success: true }); mocks.email.mockResolvedValue({ success: true });
  mocks.get.mockResolvedValue({ Item: { id: "user-1", role: "user" } });
  mocks.consume.mockResolvedValue(payload); mocks.hash.mockResolvedValue("fresh-hash"); mocks.create.mockResolvedValue("token");
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
});

it("returns identical responses before lookup for known and unknown emails", async () => {
  const unknown = await requestPasswordReset({}, form({ email: "unknown@example.com" }));
  expect(mocks.get).not.toHaveBeenCalled();
  mocks.get.mockResolvedValueOnce({}); await mocks.callbacks.shift()!();
  expect(mocks.send).not.toHaveBeenCalled();
  const known = await requestPasswordReset({}, form({ email: payload.email }));
  await mocks.callbacks.shift()!();
  expect(known).toEqual(unknown);
  expect(known).toEqual({ status: 202, message: "If an account exists, we sent a link." });
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith(payload.email, "token");
});
it.each(["ip", "email"] as const)("returns 429 before lookup when the %s limit fails", async limit => {
  mocks[limit].mockResolvedValue({ success: false });
  expect(await requestPasswordReset({}, form({ email: payload.email }))).toEqual({ status: 429 });
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.callbacks).toHaveLength(0);
});
it("does not consume a token for a weak password", async () => {
  expect((await resetPassword({}, form({ token: "token", password: "weak" }))).status).toBe(400);
  expect(mocks.consume).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects used or expired tokens without mutation", async () => {
  mocks.consume.mockResolvedValue(null);
  expect(await resetPassword({}, resetForm())).toEqual({ status: 400, message: "Link expired. Please request a new link." });
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
});
it("updates password and verification before invalidating sessions and starting a fresh one", async () => {
  await expect(resetPassword({}, resetForm())).rejects.toThrow("redirect");
  expect(mocks.hash).toHaveBeenCalledWith("StrongPass1");
  // updatePassword sets both password and emailVerified in one conditional write.
  expect(mocks.update).toHaveBeenCalledWith(payload.email, payload.userId, "fresh-hash");
  expect(mocks.update).toHaveBeenCalledBefore(mocks.invalidate);
  expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(payload.userId);
  expect(mocks.invalidate).toHaveBeenCalledBefore(mocks.session);
  expect(mocks.session).toHaveBeenCalledWith({ id: payload.userId, email: payload.email, role: "user" });
  expect(mocks.redirect).toHaveBeenCalledWith("/chat");
});
it("does not start a session if the account ID changed", async () => {
  mocks.get.mockResolvedValue({ Item: { id: "other-user", role: "user" } });
  expect((await resetPassword({}, resetForm())).status).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
});
