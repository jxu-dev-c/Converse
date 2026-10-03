import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "./types";
import { isOffTopic } from "./guardrail";
import type { WeeklyBudget } from "./budget";
import { BudgetUnavailableError, WeeklyBudgetExceededError } from "./budget";
vi.mock("../redis", () => ({ redis: {} }));

const message: ChatMessage = { id: "new", role: "user", parts: [{ type: "text", text: "private incoming " }, { type: "text", text: "question" }] };
const fetchMock = vi.fn();
const reserve = vi.fn();
const settle = vi.fn();
const budget = { reserve } as unknown as WeeklyBudget;
const answer = (medical: number, small_talk: number, off_topic: number) => ({
  answers: { scope: { type: "choice", probabilities: { medical, small_talk, off_topic } } },
});
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "private-test-key");
  vi.stubEnv("JEV_MODEL", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json(answer(1, 0, 0)));
  reserve.mockReset().mockResolvedValue({ settle });
  settle.mockReset().mockResolvedValue(undefined);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("sends joined text and a bounded previous turn without tools or reasoning", async () => {
  const history: ChatMessage[] = [
    { id: "older", role: "user", parts: [{ type: "text", text: "older user" }] },
    { id: "user", role: "user", parts: [{ type: "text", text: "u".repeat(600) }] },
    { id: "assistant", role: "assistant", parts: [
      { type: "reasoning", text: "private reasoning" },
      { type: "tool-searchDrugLabels", toolCallId: "tool", state: "output-available", input: { query: "private query" }, output: { docs: ["private tool output"], sources: [] } },
      { type: "text", text: "a".repeat(600) }, { type: "text", text: "b".repeat(600) },
    ] },
  ];
  const timeout = vi.spyOn(AbortSignal, "timeout");
  expect(await isOffTopic(message, history, budget)).toBe(false);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/systemone");
  expect(options).toMatchObject({ method: "POST", headers: { Authorization: "Bearer private-test-key", "Content-Type": "application/json" }, signal: expect.any(AbortSignal) });
  expect(JSON.parse(options.body)).toMatchObject({
    model: "jev-1.13", state: { message: "private incoming question", previous_turn: { user: "u".repeat(500), assistant: "a".repeat(600) + "b".repeat(400) } },
    questions: { scope: { type: "choice", criteria: { medical: expect.any(String), small_talk: expect.any(String), off_topic: expect.any(String) } } },
  });
  expect(options.body).not.toContain("private tool");
  expect(options.body).not.toContain("private query");
  expect(options.body).not.toContain("private reasoning");
  expect(timeout).toHaveBeenCalledExactlyOnceWith(3000);
  expect(warn).not.toHaveBeenCalled();
});

it("supports a model override and empty history", async () => {
  vi.stubEnv("JEV_MODEL", "typesafe/jev-1.13");
  await isOffTopic(message, [], budget);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: "typesafe/jev-1.13", state: { previous_turn: { user: "", assistant: "" } } });
});

it.each([
  ["off-topic", [0.1, 0.1, 0.8], true],
  ["medical", [0.8, 0.1, 0.1], false],
  ["small talk", [0.1, 0.8, 0.1], false],
  ["boundary", [0.3, 0.2, 0.5], true],
  ["below boundary", [0.3, 0.21, 0.49], false],
] as const)("applies the probability threshold for %s", async (_label, probabilities, blocked) => {
  fetchMock.mockResolvedValue(Response.json(answer(probabilities[0], probabilities[1], probabilities[2])));
  expect(await isOffTopic(message, [], budget)).toBe(blocked);
  expect(warn).not.toHaveBeenCalled();
});

describe("fail open without content logging or retries", () => {
  it.each(["missing_key", "http_500", "timeout", "abort", "json", "schema", "network", "range", "wrong_type"])("allows on %s with one reason-only warning", async failure => {
    if (failure === "missing_key") vi.stubEnv("OPENROUTER_API_KEY", "");
    if (failure === "http_500") fetchMock.mockResolvedValue(new Response("private provider error", { status: 500 }));
    if (failure === "timeout" || failure === "abort") fetchMock.mockRejectedValue(new DOMException("private incoming question", failure === "timeout" ? "TimeoutError" : "AbortError"));
    if (failure === "json") fetchMock.mockResolvedValue(new Response("private incoming question"));
    if (failure === "schema") fetchMock.mockResolvedValue(Response.json({ answers: { scope: { probabilities: { medical: 1 } } } }));
    if (failure === "network") fetchMock.mockRejectedValue(new Error("private-test-key private incoming question"));
    if (failure === "range") fetchMock.mockResolvedValue(Response.json(answer(0, 0, 1.1)));
    if (failure === "wrong_type") fetchMock.mockResolvedValue(Response.json({ answers: { scope: { ...answer(0, 0, 1).answers.scope, type: "score" } } }));
    expect(await isOffTopic(message, [], budget)).toBe(false);
    const reason = failure === "abort" ? "timeout" : ["missing_key", "http_500", "timeout"].includes(failure) ? failure : "invalid_response";
    expect(warn).toHaveBeenCalledExactlyOnceWith("Guardrail unavailable; allowing message", { reason });
    expect(fetchMock).toHaveBeenCalledTimes(failure === "missing_key" ? 0 : 1);
  });
});

it("charges OpenRouter's reported fee for a refused or malformed audit", async () => {
  for (const response of [answer(0, 0, 1), { answers: {} }]) {
    fetchMock.mockResolvedValue(Response.json({ ...response, usage: { cost: 0.000042 } }));
    await isOffTopic(message, [], budget);
  }
  expect(reserve).toHaveBeenCalledWith(0.002);
  expect(settle).toHaveBeenNthCalledWith(1, 0.000042);
  expect(settle).toHaveBeenNthCalledWith(2, 0.000042);
});

it("retains the reservation when an audit times out or has no cost", async () => {
  fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
  await isOffTopic(message, [], budget);
  expect(settle).not.toHaveBeenCalled();
  await isOffTopic(message, [], budget);
  expect(settle).toHaveBeenCalledWith(undefined);
});

it("does not reserve or call OpenRouter without a key", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  await isOffTopic(message, [], budget);
  expect(reserve).not.toHaveBeenCalled();
});

it.each([new WeeklyBudgetExceededError(1, Date.now() + 1000), new BudgetUnavailableError()])("never fails open on a budget error: %s", async error => {
  reserve.mockRejectedValueOnce(error);
  await expect(isOffTopic(message, [], budget)).rejects.toBe(error);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  settle.mockRejectedValueOnce(error);
  await expect(isOffTopic(message, [], budget)).rejects.toBe(error);
});
