"use client";
import { useEffect, useState } from "react";
import { Progress } from "@nextui-org/react";
import type { WeeklyBudgetSnapshot } from "@/app/lib/chat/budget";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default function WeeklyBudgetMeter({ isOpen }: { isOpen: boolean }) {
  const [budget, setBudget] = useState<WeeklyBudgetSnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    let pending = false;
    setBudget(null);
    setUnavailable(false);
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/ai-budget", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Usage unavailable");
        const value: WeeklyBudgetSnapshot = await response.json();
        if (!controller.signal.aborted) { setBudget(value); setUnavailable(false); }
      } catch {
        if (!controller.signal.aborted) { setBudget(null); setUnavailable(true); }
      } finally { pending = false; }
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 10_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [isOpen]);

  const percent = budget && budget.limitUsd > 0 ? Math.min(100, budget.usedUsd / budget.limitUsd * 100) : 0;
  const resetDate = budget ? new Date(budget.resetsAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";

  return <div className="w-64 max-w-[calc(100vw-2rem)] px-3 py-3 text-zinc-900 dark:text-zinc-100" aria-live="polite">
    <p className="mb-2 text-sm font-semibold">Weekly AI budget</p>
    {unavailable ? <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">Usage is temporarily unavailable.</p> : !budget ? <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">Loading usage…</p> : <>
      <p className="mb-2 flex flex-wrap items-baseline gap-x-1 text-sm"><span className="font-semibold tabular-nums">{usd.format(budget.usedUsd)}</span><span className="text-zinc-500 dark:text-zinc-400">of {usd.format(budget.limitUsd)} used</span></p>
      <Progress aria-label="Weekly AI budget used" aria-valuetext={`${usd.format(budget.usedUsd)} of ${usd.format(budget.limitUsd)} used`} size="sm" value={percent} color={percent >= 100 ? "danger" : percent >= 80 ? "warning" : "primary"} />
      <p className="mt-2 text-sm">{budget.limitUsd === 0 ? "AI requests are disabled." : budget.remainingUsd === 0 ? "Weekly limit reached" : `${usd.format(budget.remainingUsd)} remaining`}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Resets {resetDate} at 00:00 UTC</p>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Estimated usage, including active requests.</p>
    </>}
  </div>;
}
