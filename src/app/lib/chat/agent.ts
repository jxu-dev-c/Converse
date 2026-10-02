import { ToolLoopAgent, isStepCount } from "ai";
import { chatModel, providerOptions } from "./model";
import { INSTRUCTIONS } from "./prompts";
import { z } from "zod";
import { createCitationRegistry, type CitationRegistry } from "./citations";
import { createSearchTools, searchOutputSchema } from "./retrieval";

export const converseAgent = new ToolLoopAgent({
  callOptionsSchema: z.object({ registry: z.custom<CitationRegistry>() }),
  toolsContext: { searchDrugLabels: createCitationRegistry([]) },
  model: chatModel, instructions: INSTRUCTIONS, tools: createSearchTools(), toolChoice: "auto",
  stopWhen: isStepCount(4),
  prepareStep: ({ stepNumber }) => stepNumber >= 3 ? { toolChoice: "none", activeTools: [] } : undefined,
  maxOutputTokens: 4096, providerOptions,
  onToolExecutionEnd: ({ toolCall, toolOutput }) => {
    if (process.env.NODE_ENV === "development" && toolOutput.type === "tool-result") {
      const output = searchOutputSchema.parse(toolOutput.output);
      console.info("Chat retrieval", { query: toolCall.input, refs: "excerpts" in output ? output.excerpts.map(excerpt => ({ ref: excerpt.ref, id: excerpt.id })) : output.sources });
    }
  },
  onEnd: ({ providerMetadata }) => {
    if (process.env.NODE_ENV === "development") console.info("DeepSeek cache", {
      promptCacheHitTokens: providerMetadata?.deepseek?.promptCacheHitTokens,
    });
  },
  prepareCall: settings => ({ ...settings, toolsContext: { searchDrugLabels: settings.options.registry }, onError: () => console.error("Chat generation failed") }),
});
