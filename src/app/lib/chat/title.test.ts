import { beforeEach, expect, it, vi } from "vitest";
import { generateTitle } from "./title";
import type { WeeklyBudget } from "./budget";
const budget = {} as WeeklyBudget;
const generate = vi.hoisted(() => vi.fn());
const costed = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText: generate }));
vi.mock("./cost", () => ({ costedModel: costed }));
vi.mock("./model", () => ({ chatModel: {}, utilityProviderOptions: { deepseek: { thinking: { type: "disabled" } } } }));
beforeEach(() => { vi.resetAllMocks(); costed.mockReturnValue({ costed: true }); });
it("returns a short plain title with thinking disabled", async () => {
  generate.mockResolvedValue({ text: '"Ibuprofen label warnings"' });
  expect(await generateTitle("What are warnings?", budget)).toBe("Ibuprofen label warnings");
  expect(costed).toHaveBeenCalledWith({}, budget);
  expect(generate.mock.calls[0][0]).toMatchObject({ model: { costed: true }, maxOutputTokens: 24, maxRetries: 0, providerOptions: { deepseek: { thinking: { type: "disabled" } } } });
});
it.each(["empty", "error"])("falls back on %s", async kind => {
  if (kind === "empty") generate.mockResolvedValue({ text: " " }); else generate.mockRejectedValue(new Error("unavailable"));
  expect(await generateTitle("a".repeat(90), budget)).toBe("a".repeat(60));
});

it("forwards cancellation so a first-message Stop does not wait for title generation", async () => {
  const controller = new AbortController();
  generate.mockResolvedValue({ text: "Title" });
  await generateTitle("Question", budget, controller.signal);
  expect(generate.mock.calls[0][0].abortSignal).toBe(controller.signal);
});
