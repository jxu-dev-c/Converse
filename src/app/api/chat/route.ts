import { guardChatRequest } from "@/app/lib/chat/http";
import { generateTitle } from "@/app/lib/chat/title";
import { mergeIncoming, prepareHistory } from "@/app/lib/chat/context";
import { createCitationRegistry } from "@/app/lib/chat/citations";
import { converseAgent } from "@/app/lib/chat/agent";
import { loadChat, saveChat, touchChat, renameChat } from "@/app/lib/chat/store";
import { chatRequestSchema, messageMetadataSchema, type ChatMessage } from "@/app/lib/chat/types";
import {
  convertToModelMessages, createIdGenerator, createUIMessageStream, createUIMessageStreamResponse,
  toUIMessageStream, validateUIMessages,
} from "ai";
import { type NextRequest } from "next/server";

export const maxDuration = 120;
const genericError = "Unable to complete the response. Please try again.";

export async function POST(req: NextRequest) {
  const guard = await guardChatRequest(req);
  if (guard.response) return guard.response;
  const { user } = guard;
  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid chat request", { status: 400 });
  const { id, message } = parsed.data;

  try {
    const isNew = await touchChat(user.id, id);
    const title = isNew ? generateTitle(message.parts.map(part => part.text).join("")) : undefined;
    const tools = converseAgent.tools;
    const merged = await validateUIMessages<ChatMessage>({
      messages: mergeIncoming(await loadChat(user.id, id), message),
      metadataSchema: messageMetadataSchema.optional(),
      tools,
    });
    const window = prepareHistory(merged);

    const result = await converseAgent.stream({
      messages: await convertToModelMessages(window, { tools, ignoreIncompleteToolCalls: true }),
      options: { registry: createCitationRegistry(merged) },
      abortSignal: req.signal,
    });
    const reasoningStarts = new Map<string, number>();
    let reasoningMs = 0;
    // Drain the provider independently; the UI stream's onEnd also runs on cancellation.
    void result.consumeStream({ onError: () => console.error("Chat stream consumption failed") });
    return createUIMessageStreamResponse({
      stream: createUIMessageStream<ChatMessage>({
        originalMessages: merged,
        generateId: createIdGenerator({ prefix: "msg", size: 16 }),
        execute: async ({ writer }) => {
          writer.merge(toUIMessageStream({
        stream: result.stream,
        tools,
        messageMetadata: ({ part }) => {
          if (part.type === "reasoning-start") reasoningStarts.set(part.id, Date.now());
          if (part.type === "reasoning-end") {
            reasoningMs += Date.now() - (reasoningStarts.get(part.id) ?? Date.now());
            reasoningStarts.delete(part.id);
          }
          return ["start", "reasoning-end", "finish"].includes(part.type) ? { reasoningMs } : undefined;
        },
          }));
          if (title) {
            const value = await title;
            await renameChat(user.id, id, value);
            writer.write({ type: "data-title", data: { title: value }, transient: true });
          }
        },
        onEnd: async ({ messages }) => { await saveChat(user.id, messages, id); },
        onError: () => genericError,
      }),
    });
  } catch {
    console.error("Chat request failed");
    return new Response(genericError, { status: 500 });
  }
}
