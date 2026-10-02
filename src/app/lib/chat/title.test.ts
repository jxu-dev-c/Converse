import { beforeEach, expect, it, vi } from "vitest";
import { generateTitle } from "./title";
const generate = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText: generate }));
vi.mock("./model", () => ({ chatModel: {}, utilityProviderOptions: { deepseek: { thinking: { type: "disabled" } } } }));
beforeEach(() => vi.resetAllMocks());
it("returns a short plain title with thinking disabled", async () => {
  generate.mockResolvedValue({ text: '"Ibuprofen label warnings"' });
  expect(await generateTitle("What are warnings?")).toBe("Ibuprofen label warnings");
  expect(generate.mock.calls[0][0]).toMatchObject({ maxOutputTokens: 24, providerOptions: { deepseek: { thinking: { type: "disabled" } } } });
});
it.each(["empty", "error"])("falls back on %s", async kind => {
  if (kind === "empty") generate.mockResolvedValue({ text: " " }); else generate.mockRejectedValue(new Error("unavailable"));
  expect(await generateTitle("a".repeat(90))).toBe("a".repeat(60));
});

it("forwards cancellation so a first-message Stop does not wait for title generation", async () => {
  const controller = new AbortController();
  generate.mockResolvedValue({ text: "Title" });
  await generateTitle("Question", controller.signal);
  expect(generate.mock.calls[0][0].abortSignal).toBe(controller.signal);
});
