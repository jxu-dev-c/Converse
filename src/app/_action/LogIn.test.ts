import { beforeEach, expect, it, vi } from "vitest";
import { logIn } from "./LogIn";
const mocks = vi.hoisted(() => ({ callbacks: [] as (() => Promise<void>)[], login: vi.fn(), limit: vi.fn(), create: vi.fn(), send: vi.fn(), session: vi.fn() }));
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => mocks.callbacks.push(callback) }));
vi.mock("@/app/_controller/user", () => ({ logIn: mocks.login }));
vi.mock("../_auth/session", () => ({ startSession: mocks.session }));
vi.mock("@/app/lib/auth/limits", () => ({ verificationEmailLimit: { limit: mocks.limit } }));
vi.mock("@/app/lib/auth/tokens", () => ({ createToken: mocks.create }));
vi.mock("@/app/lib/auth/email", () => ({ sendVerificationEmail: mocks.send }));
const user = { id: "user-1", email: "test@example.com", role: "user" };
const form = () => { const data = new FormData(); data.set("email", user.email); data.set("password", "StrongPass1"); return data; };
beforeEach(() => {
  vi.resetAllMocks(); mocks.callbacks.length = 0;
  mocks.login.mockResolvedValue({ status: 200, user }); mocks.limit.mockResolvedValue({ success: true }); mocks.create.mockResolvedValue("token");
});
it("preserves the same 401 for unknown email and wrong password", async () => {
  mocks.login.mockResolvedValue({ status: 401, user: null, error: "Incorrect email or password" });
  expect(await logIn({}, form())).toEqual({ status: 401 }); expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
it("returns 403 and resends verification without a session", async () => {
  mocks.login.mockResolvedValue({ status: 403, user: { ...user, emailVerified: false } });
  expect(await logIn({}, form())).toEqual({ status: 403 }); await mocks.callbacks.shift()!();
  expect(mocks.send).toHaveBeenCalledWith(user.email, "token"); expect(mocks.session).not.toHaveBeenCalled();
});
it("limits verification resends", async () => {
  mocks.login.mockResolvedValue({ status: 403, user }); mocks.limit.mockResolvedValue({ success: false });
  expect(await logIn({}, form())).toEqual({ status: 429 }); expect(mocks.callbacks).toHaveLength(0); expect(mocks.session).not.toHaveBeenCalled();
});
it("starts sessions for verified and legacy accounts", async () => {
  expect(await logIn({}, form())).toEqual({ status: 200, userOutput: user }); expect(mocks.session).toHaveBeenCalledExactlyOnceWith(user);
});
