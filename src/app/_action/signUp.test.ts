import { beforeEach, expect, it, vi } from "vitest";
import { signUp } from "./signUp";

const mocks = vi.hoisted(() => ({ callbacks: [] as (() => Promise<void>)[], add: vi.fn(), ip: vi.fn(), email: vi.fn(), create: vi.fn(), verify: vi.fn(), exists: vi.fn(), cookie: vi.fn() }));
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => mocks.callbacks.push(callback) }));
vi.mock("next/headers", () => ({ cookies: mocks.cookie }));
vi.mock("@/app/_controller/user", () => ({ addUser: mocks.add }));
vi.mock("@/app/lib/auth/limits", () => ({ clientIp: async () => "127.0.0.1", signUpIpLimit: { limit: mocks.ip }, verificationEmailLimit: { limit: mocks.email } }));
vi.mock("@/app/lib/auth/tokens", () => ({ createToken: mocks.create }));
vi.mock("@/app/lib/auth/email", () => ({ sendVerificationEmail: mocks.verify, sendAccountExistsEmail: mocks.exists }));
const form = (password = "StrongPass1") => { const data = new FormData(); data.set("email", "test@example.com"); data.set("password", password); return data; };
beforeEach(() => {
  vi.resetAllMocks(); mocks.callbacks.length = 0;
  mocks.ip.mockResolvedValue({ success: true }); mocks.email.mockResolvedValue({ success: true });
  mocks.add.mockResolvedValue({ status: 200, userOutput: { id: "user-1", emailVerified: false } }); mocks.create.mockResolvedValue("token");
});
it("returns 202 for a new account and sends verification after the response without a cookie", async () => {
  expect(await signUp({}, form())).toEqual({ status: 202 });
  expect(mocks.add).toHaveBeenCalledWith({ email: "test@example.com", password: "StrongPass1", role: "user" });
  expect(mocks.verify).not.toHaveBeenCalled(); await mocks.callbacks.shift()!();
  expect(mocks.create).toHaveBeenCalledWith("verify", { userId: "user-1", email: "test@example.com" });
  expect(mocks.verify).toHaveBeenCalledWith("test@example.com", "token"); expect(mocks.cookie).not.toHaveBeenCalled();
});
it("returns the identical 202 for an existing account and sends the account-exists email", async () => {
  mocks.add.mockResolvedValue({ status: 409, userOutput: null });
  expect(await signUp({}, form())).toEqual({ status: 202 }); await mocks.callbacks.shift()!();
  expect(mocks.exists).toHaveBeenCalledWith("test@example.com"); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.cookie).not.toHaveBeenCalled();
});
it.each(["ip", "email"] as const)("limits %s before accessing the user", async limit => {
  mocks[limit].mockResolvedValue({ success: false }); expect(await signUp({}, form())).toEqual({ status: 429 }); expect(mocks.add).not.toHaveBeenCalled();
});
it("rejects weak passwords on the server", async () => {
  expect((await signUp({}, form("weak"))).status).toBe(400); expect(mocks.add).not.toHaveBeenCalled();
});
