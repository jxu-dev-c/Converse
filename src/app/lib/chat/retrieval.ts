import { convertToModelMessages, generateText, type LanguageModel } from "ai";
import { Index } from "@upstash/vector";
import { messageText } from "./context";
import { chatModel, providerOptions } from "./model";
import { CONDENSE_QUERY_INSTRUCTIONS } from "./prompts";
import type { ChatMessage } from "./types";

export async function condenseQuery(window: ChatMessage[], model: LanguageModel = chatModel): Promise<string> {
  const question = window.findLast(message => message.role === "user");
  if (!question) return "";
  const rawQuestion = messageText(question);
  if (window.filter(message => message.role === "user").length < 2) return rawQuestion;
  try {
    let recent = window.slice(-6);
    if (recent[0]?.role !== "user") recent = recent.slice(1);
    const messages = await convertToModelMessages(recent);
    // The final user message must ask for rewriting, rather than inviting an
    // answer to the drug question from the preceding assistant conversation.
    messages[messages.length - 1] = {
      role: "user",
      content: `Rewrite this question as a standalone drug-label search query. Return only the query.\n<question>${rawQuestion}</question>`,
    };
    const { text } = await generateText({
      model,
      instructions: CONDENSE_QUERY_INSTRUCTIONS,
      messages,
      maxOutputTokens: 128,
      maxRetries: 0,
      timeout: 10_000,
      providerOptions,
      temperature: 0,
    });
    return text.trim() || rawQuestion;
  } catch {
    return rawQuestion;
  }
}

export async function retrieveContext(query: string) {
  const results = await Index.fromEnv().query({
    data: query, topK: 5, includeData: true, includeMetadata: true,
  });
  const matches = results.filter(result => result.score >= 0.5 && result.data);
  return {
    docs: matches.map(result => result.data!),
    sources: matches.map(result => ({ id: String(result.id), score: result.score })),
  };
}
