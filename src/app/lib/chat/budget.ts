import { randomUUID } from "node:crypto";
import { redis } from "../redis";

const USD_SCALE = 1_000_000_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class WeeklyBudgetExceededError extends Error {
  constructor(readonly limitUsd: number, readonly resetsAt: number) {
    super(`Weekly AI spending limit reached ($${limitUsd}). Please try again after ${new Date(resetsAt).toISOString().slice(0, 10)} at 00:00 UTC.`);
    this.name = "WeeklyBudgetExceededError";
  }
}

export class BudgetUnavailableError extends Error {
  constructor() {
    super("AI spending limits are temporarily unavailable. Please try again later.");
    this.name = "BudgetUnavailableError";
  }
}

// Calendar weeks start Monday at 00:00 UTC. Each reservation retains its own
// week key so a completion after midnight cannot debit the following week.
export function budgetWeek(now = Date.now()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  return { startsAt: start.getTime(), resetsAt: start.getTime() + WEEK_MS };
}

function units(usd: number) {
  const value = Math.ceil(usd * USD_SCALE);
  if (!Number.isFinite(usd) || usd < 0 || !Number.isSafeInteger(value)) throw new BudgetUnavailableError();
  return value;
}

export interface CostReservation {
  // Undefined usage retains the maximum charge, including on cancellation,
  // network failure, or a process crash. Never refund an unconfirmed charge.
  settle(actualUsd?: number): Promise<void>;
}

export class WeeklyBudget {
  readonly limitUsd: number;
  private readonly limitUnits: number;

  constructor(private readonly userId: string) {
    this.limitUsd = Number(process.env.AI_WEEKLY_COST_CAP_USD?.trim() || "1");
    this.limitUnits = Math.floor(this.limitUsd * USD_SCALE);
    units(this.limitUsd);
  }

  private key(startsAt: number) { return `converse:ai-budget:${this.userId}:${startsAt}`; }

  async assertAvailable() {
    const week = budgetWeek();
    let used: number;
    try { used = Number(await redis.hget(this.key(week.startsAt), "total") ?? 0); }
    catch { throw new BudgetUnavailableError(); }
    if (!Number.isSafeInteger(used) || used < 0) throw new BudgetUnavailableError();
    if (used >= this.limitUnits) throw new WeeklyBudgetExceededError(this.limitUsd, week.resetsAt);
  }

  async reserve(maximumUsd: number): Promise<CostReservation> {
    const maximum = units(maximumUsd);
    const week = budgetWeek();
    const key = this.key(week.startsAt);
    const id = `reservation:${randomUUID()}`;
    let accepted: number;
    try {
      accepted = Number(await redis.eval(`
local total = tonumber(redis.call('hget', KEYS[1], 'total') or '0')
if not total or total < 0 then return -1 end
if total >= tonumber(ARGV[1]) or total + tonumber(ARGV[2]) > tonumber(ARGV[1]) then return 0 end
redis.call('hincrby', KEYS[1], 'total', ARGV[2])
redis.call('hset', KEYS[1], ARGV[3], ARGV[2])
redis.call('expireat', KEYS[1], ARGV[4])
return 1`, [key], [this.limitUnits, maximum, id, Math.ceil((week.resetsAt + WEEK_MS) / 1000)]));
    } catch { throw new BudgetUnavailableError(); }
    if (accepted === 0) throw new WeeklyBudgetExceededError(this.limitUsd, week.resetsAt);
    if (accepted !== 1) throw new BudgetUnavailableError();

    return {
      settle: async actualUsd => {
        if (actualUsd === undefined) return;
        const actual = units(actualUsd);
        // Idempotent settlement: Redis keeps the hold if persistence fails.
        // Record even an unexpectedly high provider bill, blocking later calls.
        try {
          await redis.eval(`
local reserved = redis.call('hget', KEYS[1], ARGV[1])
if not reserved then return 0 end
redis.call('hincrby', KEYS[1], 'total', tonumber(ARGV[2]) - tonumber(reserved))
redis.call('hdel', KEYS[1], ARGV[1])
return 1`, [key], [id, actual]);
        } catch { throw new BudgetUnavailableError(); }
      },
    };
  }
}
