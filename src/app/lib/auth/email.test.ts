import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { appUrl, sendAccountExistsEmail, sendPasswordResetEmail, sendVerificationEmail } from "./email";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  for (const name of ["APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"]) vi.stubEnv(name, "");
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("EMAIL_FROM", "Converse <no-reply@example.com>");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async () => new Response(JSON.stringify({ id: "email-1" })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("uses trusted origins in the approved order", () => {
  expect(appUrl("/start/log-in")).toBe("http://localhost:3000/start/log-in");
  vi.stubEnv("VERCEL_URL", "preview.example.com"); expect(appUrl("/start/log-in")).toBe("https://preview.example.com/start/log-in");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "production.example.com");
  expect(appUrl("/start/log-in")).toBe("https://preview.example.com/start/log-in");
  vi.stubEnv("NODE_ENV", "production"); expect(appUrl("/start/log-in")).toBe("https://production.example.com/start/log-in");
  vi.stubEnv("APP_URL", "https://app.example.com"); expect(appUrl("/start/log-in")).toBe("https://app.example.com/start/log-in");
});
it("sends text and HTML versions with confirmation/reset/login links", async () => {
  await sendVerificationEmail("test@example.com", "verify-token");
  await sendPasswordResetEmail("test@example.com", "reset-token");
  await sendAccountExistsEmail("test@example.com");
  const sent = mocks.fetch.mock.calls.map(([_url, options]) => JSON.parse(options.body));
  expect(sent[0].text).toContain("/start/verify-email?token=verify-token");
  expect(sent[1].html).toContain("/start/reset-password?token=reset-token");
  expect(sent[2].text).toContain("/start/log-in"); expect(sent[2].text).toContain("/start/forgot-password");
  for (const email of sent) expect(email).toMatchObject({ to: "test@example.com", from: "Converse <no-reply@example.com>", html: expect.any(String), text: expect.any(String) });
});
it("logs only fixed reasons, never recipient/provider messages", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: "test@example.com private-key" }), { status: 403 }))
      .mockRejectedValueOnce(new Error("test@example.com private-key"));
    await sendVerificationEmail("test@example.com", "token"); await sendPasswordResetEmail("test@example.com", "token");
    expect(log.mock.calls).toEqual([["Auth email failed: provider_rejected"], ["Auth email failed: transport_error"]]);
  } finally { log.mockRestore(); }
});
