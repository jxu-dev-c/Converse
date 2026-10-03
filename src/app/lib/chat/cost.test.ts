import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { costedModel, jevReservationUsd, reportedJevCost } from "./cost";
import { BudgetUnavailableError, WeeklyBudgetExceededError, type WeeklyBudget } from "./budget";
vi.mock("../redis", () => ({ redis: {} }));
const reserve = vi.fn();
const settle = vi.fn();
const budget = { reserve } as unknown as WeeklyBudget;
const usage = {
  inputTokens: { total: 1000, noCache: 400, cacheRead: 600, cacheWrite: 0 },
  outputTokens: { total: 200, text: 150, reasoning: 50 },
};
const options = { prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "Question 中文" }] }], maxOutputTokens: 4096 };
const generate = vi.fn();
const stream = vi.fn();
const base = () => new MockLanguageModelV4({ modelId: "deepseek-v4-flash", doGenerate: generate, doStream: stream });
const drain = async (source: ReadableStream) => {
  const reader = source.getReader();
  while (!(await reader.read()).done) { /* consume provider finish/usage */ }
};
beforeEach(() => {
  vi.resetAllMocks();
  reserve.mockResolvedValue({ settle });
  settle.mockResolvedValue(undefined);
  generate.mockResolvedValue({ content: [], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] });
  stream.mockResolvedValue({ stream: simulateReadableStream({ chunks: [
    { type: "stream-start", warnings: [] }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
  ] }) });
});
afterEach(() => vi.unstubAllEnvs());

it.each(["generate", "stream"])("prices %s with TokenLens without double-charging cached input or reasoning", async kind => {
  const model = costedModel(base(), budget);
  if (kind === "generate") await model.doGenerate(options);
  else await drain((await model.doStream(options)).stream);
  // 400 uncached + 600 cached input; 200 output includes the 50 reasoning tokens.
  expect(settle.mock.calls[0][0]).toBeCloseTo(0.0003636, 12);
  expect(reserve.mock.calls[0][0]).toBeGreaterThan(settle.mock.calls[0][0]);
  expect(reserve.mock.invocationCallOrder[0]).toBeLessThan((kind === "generate" ? generate : stream).mock.invocationCallOrder[0]);
});

it("charges every model call separately and reserves for tools and output", async () => {
  const model = costedModel(base(), budget);
  await model.doGenerate(options);
  const first = reserve.mock.calls[0][0];
  await model.doGenerate({ ...options, tools: [{ type: "function", name: "search", description: "x".repeat(1000), inputSchema: { type: "object" } }] });
  expect(reserve.mock.calls[1][0]).toBeGreaterThan(first);
  expect(settle).toHaveBeenCalledTimes(2);
});

it("supports explicit prices and rejects unknown models without prices", async () => {
  const model = new MockLanguageModelV4({ modelId: "custom", doGenerate: generate });
  expect(() => costedModel(model, budget)).toThrow(BudgetUnavailableError);
  vi.stubEnv("DEEPSEEK_INPUT_USD_PER_MILLION", "2");
  vi.stubEnv("DEEPSEEK_CACHED_INPUT_USD_PER_MILLION", "0.5");
  vi.stubEnv("DEEPSEEK_OUTPUT_USD_PER_MILLION", "4");
  await costedModel(model, budget).doGenerate(options);
  expect(settle.mock.calls[0][0]).toBeCloseTo(0.0019, 12);
});

it("reserves the higher input rate even if an override makes cache reads more expensive", async () => {
  vi.stubEnv("DEEPSEEK_INPUT_USD_PER_MILLION", "0");
  vi.stubEnv("DEEPSEEK_CACHED_INPUT_USD_PER_MILLION", "2");
  vi.stubEnv("DEEPSEEK_OUTPUT_USD_PER_MILLION", "0");
  await costedModel(base(), budget).doGenerate(options);
  expect(reserve.mock.calls[0][0]).toBeGreaterThan(settle.mock.calls[0][0]);
});

it("does not contact the provider when reservation fails", async () => {
  reserve.mockRejectedValueOnce(new WeeklyBudgetExceededError(1, Date.now() + 1000));
  await expect(costedModel(base(), budget).doGenerate(options)).rejects.toBeInstanceOf(WeeklyBudgetExceededError);
  expect(generate).not.toHaveBeenCalled();
});

it("keeps holds on provider errors, incomplete streams, and unavailable usage", async () => {
  const model = costedModel(base(), budget);
  generate.mockRejectedValueOnce(new Error("network failure"));
  await expect(model.doGenerate(options)).rejects.toThrow("network failure");
  expect(settle).not.toHaveBeenCalled();
  stream.mockResolvedValueOnce({ stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }] }) });
  const result = await model.doStream(options);
  await drain(result.stream);
  expect(settle).not.toHaveBeenCalled();
  generate.mockResolvedValueOnce({ usage: { ...usage, inputTokens: { ...usage.inputTokens, total: undefined } } });
  await model.doGenerate(options);
  expect(settle).toHaveBeenCalledWith(undefined);
  generate.mockResolvedValueOnce({ usage: { ...usage, raw: { prompt_tokens: 1000 } } });
  await model.doGenerate(options);
  expect(settle).toHaveBeenLastCalledWith(undefined);
});

it("uses Jev's billed fee, rejects invalid fees, and allows a reservation override", () => {
  expect(jevReservationUsd()).toBe(0.002);
  vi.stubEnv("JEV_REQUEST_RESERVE_USD", "0.01");
  expect(jevReservationUsd()).toBe(0.01);
  expect(reportedJevCost({ usage: { cost: 0.0001 } })).toBe(0.0001);
  for (const cost of [-1, NaN, Infinity, "0.1", undefined]) expect(reportedJevCost({ usage: { cost } })).toBeUndefined();
});

it("accounts for the installed DeepSeek provider's actual usage shape", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({
    id: "test", model: "deepseek-v4-flash", created: 0,
    choices: [{ index: 0, message: { role: "assistant", content: "Answer", reasoning_content: "Thinking" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_cache_hit_tokens: 600, completion_tokens_details: { reasoning_tokens: 50 } },
  }));
  const provider = createDeepSeek({ apiKey: "test-only", fetch });
  await costedModel(provider("deepseek-v4-flash"), budget).doGenerate(options);
  expect(fetch).toHaveBeenCalledOnce();
  expect(settle.mock.calls[0][0]).toBeCloseTo(0.0003636, 12);
});
