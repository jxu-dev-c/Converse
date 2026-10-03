import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { budgetWeek } from "@/app/lib/chat/budget";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), limit: vi.fn(), hget: vi.fn() }));
vi.mock("@/app/_auth/validate-request", () => ({ validateRequest: mocks.auth }));
vi.mock("@/app/lib/redis", () => ({ redis: { hget: mocks.hget } }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } limit = mocks.limit; } }));
const request = (origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/ai-budget?userId=another-user", { headers: { origin } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_WEEKLY_COST_CAP_USD", "1");
  mocks.auth.mockResolvedValue({ user: { id: "signed-in-user" } });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.hget.mockResolvedValue(250_000_000);
});
afterEach(() => vi.unstubAllEnvs());

it("returns only the signed-in user's budget and forbids caching", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ limitUsd: 1, usedUsd: 0.25, remainingUsd: 0.75, resetsAt: budgetWeek().resetsAt });
  expect(mocks.hget).toHaveBeenCalledExactlyOnceWith(`converse:ai-budget:signed-in-user:${budgetWeek().startsAt}`, "total");
  expect(mocks.limit).toHaveBeenCalledWith("signed-in-user");
});

it("rejects unauthenticated and cross-origin requests without reading a budget", async () => {
  expect((await GET(request("https://foreign.example"))).status).toBe(403);
  expect(mocks.auth).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue({ user: null });
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.hget).not.toHaveBeenCalled();
});

it("rate limits reads without accessing the budget", async () => {
  mocks.limit.mockResolvedValue({ success: false, reset: Date.now() + 10_000 });
  const response = await GET(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBeTruthy();
  expect(mocks.hget).not.toHaveBeenCalled();
});

it.each([1_000_000_000, 1_100_000_000])("allows the meter to load when the budget is exhausted: %s", async used => {
  mocks.hget.mockResolvedValue(used);
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ usedUsd: used / 1_000_000_000, remainingUsd: 0 });
});

it("reports a disabled budget without blocking the meter", async () => {
  vi.stubEnv("AI_WEEKLY_COST_CAP_USD", "0");
  mocks.hget.mockResolvedValue(null);
  expect(await (await GET(request())).json()).toMatchObject({ limitUsd: 0, usedUsd: 0, remainingUsd: 0 });
});

it.each(["redis", "configuration"])("returns a safe unavailable response on %s errors", async kind => {
  if (kind === "redis") mocks.hget.mockRejectedValue(new Error("private-token"));
  else vi.stubEnv("AI_WEEKLY_COST_CAP_USD", "invalid");
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).not.toContain("private-token");
});
