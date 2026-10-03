import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetUnavailableError, budgetWeek, WeeklyBudget, WeeklyBudgetExceededError } from "./budget";

const redis = vi.hoisted(() => ({ hget: vi.fn(), eval: vi.fn() }));
vi.mock("../redis", () => ({ redis }));
const run = promisify(execFile);
const serverPath = process.env.TEST_REDIS_SERVER;
const cliPath = process.env.TEST_REDIS_CLI;

// Optional real-Redis verification. Runs on an isolated temporary Unix socket
// with persistence disabled; never connects to an application Redis instance.
describe.skipIf(!serverPath || !cliPath)("weekly budget Lua against Redis", () => {
  let directory: string;
  let socket: string;
  let server: ChildProcess;
  const command = async (...args: string[]) => (await run(cliPath!, ["--raw", "-s", socket, ...args])).stdout.trim();
  beforeAll(async () => {
    // macOS's per-user tmpdir can exceed the Unix socket path length limit.
    directory = await mkdtemp(join(process.platform === "darwin" ? "/tmp" : tmpdir(), "converse-budget-test-"));
    socket = join(directory, "redis.sock");
    server = spawn(serverPath!, ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
    await vi.waitFor(async () => expect(await command("ping")).toBe("PONG"), { timeout: 5000 });
    redis.hget.mockImplementation(async (key, field) => (await command("hget", key, field)) || null);
    redis.eval.mockImplementation(async (script, keys, args) => {
      const result = await command("eval", script, String(keys.length), ...keys, ...args.map(String));
      if (!/^-?\d+$/.test(result)) throw new Error("Redis script failed");
      return Number(result);
    });
  });
  afterAll(async () => {
    await command("shutdown", "nosave").catch(() => {});
    server?.kill();
    await rm(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    vi.stubEnv("AI_WEEKLY_COST_CAP_USD", "1");
    vi.useRealTimers();
    await command("flushdb");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("allows exactly the cap across simultaneous requests and isolates users", async () => {
    const budget = new WeeklyBudget("user-a");
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => budget.reserve(0.1)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(10);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toBeInstanceOf(WeeklyBudgetExceededError);
    await expect(budget.assertAvailable()).rejects.toBeInstanceOf(WeeklyBudgetExceededError);
    await expect(new WeeklyBudget("user-b").reserve(1)).resolves.toBeDefined();
  });

  it("refunds only confirmed unused cost, settles once and retains missing usage", async () => {
    const budget = new WeeklyBudget("user");
    const hold = await budget.reserve(1);
    await Promise.all([hold.settle(0.25), hold.settle(0.25)]);
    const remainder = await budget.reserve(0.75);
    await remainder.settle();
    await expect(budget.reserve(0.000000001)).rejects.toBeInstanceOf(WeeklyBudgetExceededError);
    await remainder.settle(0.5);
    await expect(budget.reserve(0.25)).resolves.toBeDefined();
  });

  it("charges unexpected provider overruns and blocks further spending", async () => {
    const budget = new WeeklyBudget("user");
    const hold = await budget.reserve(0.1);
    await hold.settle(1.1);
    await expect(budget.reserve(0.01)).rejects.toBeInstanceOf(WeeklyBudgetExceededError);
  });

  it("settles to the original week and gives the next week a fresh budget", async () => {
    const { startsAt, resetsAt } = budgetWeek();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(resetsAt - 1000);
    const budget = new WeeklyBudget("user");
    const hold = await budget.reserve(1);
    vi.setSystemTime(resetsAt);
    await hold.settle(0.9);
    expect(await command("hget", `converse:ai-budget:user:${startsAt}`, "total")).toBe("900000000");
    await expect(budget.reserve(1)).resolves.toBeDefined();
    expect(await command("hget", `converse:ai-budget:user:${resetsAt}`, "total")).toBe("1000000000");
  });

  it("retains the charge when settlement cannot reach Redis", async () => {
    const budget = new WeeklyBudget("user");
    const hold = await budget.reserve(1);
    redis.eval.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(hold.settle(0)).rejects.toBeInstanceOf(BudgetUnavailableError);
    await expect(budget.reserve(0.01)).rejects.toBeInstanceOf(WeeklyBudgetExceededError);
  });
});
