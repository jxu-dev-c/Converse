import { createDeepSeek, type DeepSeekLanguageModelChatOptions } from "@ai-sdk/deepseek";

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });
export const chatModel = deepseek(process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash");
export const providerOptions = {
  deepseek: { thinking: { type: "enabled" }, reasoningEffort: "high" } satisfies DeepSeekLanguageModelChatOptions,
};

export const utilityProviderOptions = {
  deepseek: { thinking: { type: "disabled" } } satisfies DeepSeekLanguageModelChatOptions,
};
