import { getTokenCosts } from "@tokenlens/helpers";
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import { BudgetUnavailableError, type WeeklyBudget } from "./budget";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
type CallOptions = Parameters<ReturnType<typeof wrapLanguageModel>["doGenerate"]>[0];
type Usage = Awaited<ReturnType<ReturnType<typeof wrapLanguageModel>["doGenerate"]>>["usage"];

// Verified 2026-10-02 against https://api-docs.deepseek.com/quick_start/pricing/.
// Peak rates deliberately provide a conservative cap even during off-peak hours.
const flash = { input: 0.3, cache_read: 0.006, output: 1.2 };
const pro = { input: 1.32, cache_read: 0.044, output: 3.96 };
const defaults: Record<string, typeof flash> = {
  "deepseek-v4-flash": flash, "deepseek-flash": flash,
  "deepseek-v4-flash-vision-exp": flash, "deepseek-v4-pro": pro,
};

function rate(value: string | undefined, fallback?: number) {
  const parsed = value?.trim() ? Number(value) : fallback;
  if (parsed === undefined || !Number.isFinite(parsed) || parsed < 0) throw new BudgetUnavailableError();
  return parsed;
}

function pricing(modelId: string) {
  const base = defaults[modelId];
  return {
    input: rate(process.env.DEEPSEEK_INPUT_USD_PER_MILLION, base?.input),
    cache_read: rate(process.env.DEEPSEEK_CACHED_INPUT_USD_PER_MILLION, base?.cache_read),
    output: rate(process.env.DEEPSEEK_OUTPUT_USD_PER_MILLION, base?.output),
  };
}

function calculator(modelId: string, maximum = false) {
  const cost = pricing(modelId);
  if (maximum) cost.input = Math.max(cost.input, cost.cache_read);
  const providers = { id: "deepseek", models: { [modelId]: { id: modelId, name: modelId, cost } } };
  return (input: number, output: number, cacheReads = 0) => {
    // TokenLens adds cache costs to input costs. Pass uncached input separately.
    // DeepSeek output totals already include reasoning; don't charge it twice.
    const result = getTokenCosts(modelId, { input, output, cacheReads }, providers).totalUSD;
    if (result === undefined || !Number.isFinite(result) || result < 0) throw new BudgetUnavailableError();
    return result;
  };
}

function tokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function costedModel(model: Model, budget: WeeklyBudget) {
  const cost = calculator(model.modelId);
  const maximumCost = calculator(model.modelId, true);
  const reserve = (params: CallOptions) => {
    if (!tokenCount(params.maxOutputTokens)) throw new BudgetUnavailableError();
    // Text-only prompts: UTF-8 bytes conservatively bound tokens, with padding
    // for the provider's message/tool templates. Include every tool round.
    const input = Buffer.byteLength(JSON.stringify({ prompt: params.prompt, tools: params.tools, responseFormat: params.responseFormat }), "utf8") + 4096;
    return budget.reserve(maximumCost(input, params.maxOutputTokens));
  };
  const actualCost = (usage: Usage) => {
    // The DeepSeek adapter fills absent fields in a partial usage payload with
    // zero. Keep the hold when raw usage reveals that totals weren't reported.
    if (usage.raw && (!tokenCount(usage.raw.prompt_tokens) || !tokenCount(usage.raw.completion_tokens))) return undefined;
    const input = usage.inputTokens.total;
    const output = usage.outputTokens.total;
    const cached = usage.inputTokens.cacheRead ?? 0;
    if (!tokenCount(input) || !tokenCount(output) || !tokenCount(cached) || cached > input) return undefined;
    return cost(input - cached, output, cached);
  };
  const middleware: LanguageModelMiddleware = {
    wrapGenerate: async ({ params, doGenerate }) => {
      const reservation = await reserve(params);
      const result = await doGenerate();
      await reservation.settle(actualCost(result.usage));
      return result;
    },
    wrapStream: async ({ params, doStream }) => {
      const reservation = await reserve(params);
      const result = await doStream();
      return { ...result, stream: result.stream.pipeThrough(new TransformStream({
        transform: async (part, controller) => {
          if (part.type === "finish") await reservation.settle(actualCost(part.usage));
          controller.enqueue(part);
        },
      })) };
    },
  };
  return wrapLanguageModel({ model, middleware });
}

export function jevReservationUsd() {
  // Current Jev: 32K context at $0.042/M input tokens, free output.
  // Use OpenRouter usage.cost for settlement, and retain the hold if unknown.
  const amount = rate(process.env.JEV_REQUEST_RESERVE_USD, 0.002);
  if (amount === 0) throw new BudgetUnavailableError();
  return amount;
}

export function reportedJevCost(result: unknown): number | undefined {
  if (!result || typeof result !== "object" || !("usage" in result)) return undefined;
  const usage = result.usage;
  if (!usage || typeof usage !== "object" || !("cost" in usage)) return undefined;
  return typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : undefined;
}
