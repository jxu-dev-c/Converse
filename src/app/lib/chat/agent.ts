import { ToolLoopAgent, isStepCount } from "ai";
import { chatModel, providerOptions } from "./model";
import { INSTRUCTIONS } from "./prompts";
import { createSearchTools } from "./retrieval";

export const converseAgent = new ToolLoopAgent({
  model: chatModel, instructions: INSTRUCTIONS, tools: createSearchTools(), toolChoice: "auto",
  stopWhen: isStepCount(4),
  prepareStep: ({ stepNumber }) => stepNumber >= 3 ? { toolChoice: "none", activeTools: [] } : undefined,
  maxOutputTokens: 4096, providerOptions,
  onToolExecutionEnd: ({ toolCall, toolOutput }) => {
    if (process.env.NODE_ENV === "development" && toolOutput.type === "tool-result") {
      console.info("Chat retrieval", { query: toolCall.input, result: toolOutput.output });
    }
  },
  onEnd: ({ providerMetadata }) => {
    if (process.env.NODE_ENV === "development") console.info("DeepSeek cache", {
      promptCacheHitTokens: providerMetadata?.deepseek?.promptCacheHitTokens,
    });
  },
  prepareCall: settings => ({ ...settings, onError: () => console.error("Chat generation failed") }),
});
