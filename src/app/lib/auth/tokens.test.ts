import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { consumeToken, createToken, peekToken } from "./tokens";

const mocks = vi.hoisted(() => ({ set: vi.fn(), exists: vi.fn(), getdel: vi.fn() }));
vi.mock("../redis", () => ({ redis: mocks }));
beforeEach(() => vi.resetAllMocks());
const payload = { userId: "user-1", email: "test@example.com" };

it.each([["reset", 1800], ["verify", 86400]] as const)("stores only the %s token hash with TTL %s", async (kind, ttl) => {
  const token = await createToken(kind, payload);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const hash = createHash("sha256").update(token).digest("hex");
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(`converse:auth:${kind}:${hash}`, payload, { ex: ttl });
  expect(JSON.stringify(mocks.set.mock.calls)).not.toContain(token);
});

it("peeks without consuming and consumes atomically once", async () => {
  let stored: typeof payload | null = payload;
  mocks.exists.mockImplementation(async () => stored ? 1 : 0);
  mocks.getdel.mockImplementation(async () => { const value = stored; stored = null; return value; });
  const token = await createToken("reset", payload);
  expect(await peekToken("reset", token)).toBe(true);
  expect(await peekToken("reset", token)).toBe(true);
  expect(mocks.getdel).not.toHaveBeenCalled();
  const results = await Promise.all([consumeToken("reset", token), consumeToken("reset", token)]);
  expect(results).toEqual([payload, null]);
  expect(await peekToken("reset", token)).toBe(false);
  expect(mocks.getdel.mock.calls[0][0]).toContain("converse:auth:reset:");
});

it("rejects malformed tokens without Redis access", async () => {
  expect(await peekToken("verify", "malformed")).toBe(false);
  expect(await consumeToken("verify", "malformed")).toBeNull();
  expect(mocks.exists).not.toHaveBeenCalled();
  expect(mocks.getdel).not.toHaveBeenCalled();
});
