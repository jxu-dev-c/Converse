import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BudgetUnavailableError, budgetWeek, WeeklyBudget, WeeklyBudgetExceededError } from "./budget";
const redis = vi.hoisted(() => ({ hget: vi.fn(), eval: vi.fn() }));
vi.mock("../redis", () => ({ redis }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_WEEKLY_COST_CAP_USD", "");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T23:59:59Z"));
  redis.hget.mockResolvedValue(null);
  redis.eval.mockResolvedValue(1);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("defaults to $1 and resets precisely at Monday midnight UTC", async () => {
  const budget = new WeeklyBudget("user-a");
  expect(budget.limitUsd).toBe(1);
  expect(budgetWeek()).toEqual({ startsAt: Date.parse("2026-09-28T00:00:00Z"), resetsAt: Date.parse("2026-10-05T00:00:00Z") });
  await budget.assertAvailable();
  expect(redis.hget).toHaveBeenCalledWith(`converse:ai-budget:user-a:${Date.parse("2026-09-28")}`, "total");
  vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
  await budget.assertAvailable();
  expect(redis.hget).toHaveBeenLastCalledWith(`converse:ai-budget:user-a:${Date.parse("2026-10-05")}`, "total");
  await new WeeklyBudget("user-b").assertAvailable();
  expect(redis.hget.mock.calls.at(-1)?.[0]).toContain(":user-b:");
});

it("supports an env override, including zero to disable paid calls", async () => {
  vi.stubEnv("AI_WEEKLY_COST_CAP_USD", "2.5");
  expect(new WeeklyBudget("user").limitUsd).toBe(2.5);
  vi.stubEnv("AI_WEEKLY_COST_CAP_USD", "0");
  await expect(new WeeklyBudget("user").assertAvailable()).rejects.toBeInstanceOf(WeeklyBudgetExceededError);
});

it.each(["-1", "NaN", "Infinity", "invalid", "9007199254740992"])("fails closed on invalid configuration %s", value => {
  vi.stubEnv("AI_WEEKLY_COST_CAP_USD", value);
  expect(() => new WeeklyBudget("user")).toThrow(BudgetUnavailableError);
});

it("rejects at the cap and fails closed when Redis cannot check it", async () => {
  const budget = new WeeklyBudget("user");
  redis.hget.mockResolvedValueOnce(1_000_000_000);
  await expect(budget.assertAvailable()).rejects.toMatchObject({ limitUsd: 1, resetsAt: Date.parse("2026-10-05") });
  redis.hget.mockRejectedValueOnce(new Error("private credentials"));
  await expect(budget.assertAvailable()).rejects.toThrow("AI spending limits are temporarily unavailable");
  redis.eval.mockRejectedValueOnce(new Error("unavailable"));
  await expect(budget.reserve(0.01)).rejects.toBeInstanceOf(BudgetUnavailableError);
  redis.eval.mockResolvedValueOnce(0);
  await expect(budget.reserve(0.01)).rejects.toBeInstanceOf(WeeklyBudgetExceededError);
});

it("keeps settlement in the original week, rounds costs upward and retains unknown charges", async () => {
  const budget = new WeeklyBudget("user");
  const reservation = await budget.reserve(0.0000000011);
  expect(redis.eval.mock.calls[0][2]).toEqual([1_000_000_000, 2, expect.stringMatching(/^reservation:/), Date.parse("2026-10-12") / 1000]);
  const key = redis.eval.mock.calls[0][1];
  await reservation.settle();
  expect(redis.eval).toHaveBeenCalledOnce();
  vi.setSystemTime(new Date("2026-10-05T00:01:00Z"));
  await reservation.settle(0.0000000001);
  expect(redis.eval.mock.calls[1][1]).toEqual(key);
  expect(redis.eval.mock.calls[1][2][1]).toBe(1);
});
