import { guardChatRequest } from "@/app/lib/chat/http";
import { generateTitle } from "@/app/lib/chat/title";
import { mergeIncoming, prepareHistory } from "@/app/lib/chat/context";
import { isOffTopic } from "@/app/lib/chat/guardrail";
import { OFF_TOPIC_REPLY } from "@/app/lib/chat/prompts";
import { createCitationRegistry } from "@/app/lib/chat/citations";
import { converseAgent } from "@/app/lib/chat/agent";
import { BudgetUnavailableError, WeeklyBudget, WeeklyBudgetExceededError } from "@/app/lib/chat/budget";
import { beginStream, getChat, loadChat, saveChatIfActive, touchChat, renameChat } from "@/app/lib/chat/store";
import { batchSse, stopActiveStream, streamContext, subscribe } from "@/app/lib/chat/stream";
import { chatRequestSchema, messageMetadataSchema, type ChatMessage } from "@/app/lib/chat/types";
import {
  consumeStream, convertToModelMessages, createIdGenerator, createUIMessageStream, createUIMessageStreamResponse,
  generateId, toUIMessageStream, validateUIMessages,
} from "ai";
import { type NextRequest } from "next/server";
export const maxDuration = 60;
const genericError = "Unable to complete the response. Please try again.";
const messageId = createIdGenerator({ prefix: "msg", size: 16 });
const streamError = (error: unknown) => error instanceof WeeklyBudgetExceededError || error instanceof BudgetUnavailableError ? error.message : genericError;

function refusalResponse() {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        const id = messageId();
        writer.write({ type: "start", messageId: id });
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: OFF_TOPIC_REPLY });
        writer.write({ type: "text-end", id });
        writer.write({ type: "finish" });
      },
    }),
  });
}

export async function POST(req: NextRequest) {
  const guard = await guardChatRequest(req);
  if (guard.response) return guard.response;
  const { user } = guard;
  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid chat request", { status: 400 });
  const { id, message } = parsed.data;
  const streamId = generateId();
  const controller = new AbortController();
  let unsubscribe: (() => Promise<void>) | undefined;
  let merged: ChatMessage[] = [];
  let claimed = false;
  try {
    const budget = new WeeklyBudget(user.id);
    await budget.assertAvailable();
    const history = await loadChat(user.id, id);
    let incoming = mergeIncoming(history, message);
    if (await isOffTopic(message, incoming.slice(0, -1), budget)) return refusalResponse();
    const chat = await getChat(user.id, id);
    const previous = chat?.meta.activeStreamId;
    if (previous && !await stopActiveStream(user.id, id, previous)) return new Response("Previous reply is still stopping. Please retry.", { status: 409 });
    // The previous producer may finish during the audit, or persist partial output on stop.
    incoming = mergeIncoming(previous ? await loadChat(user.id, id) : chat?.messages ?? history, message);
    const isNew = await touchChat(user.id, id);
    const tools = converseAgent.tools;
    merged = await validateUIMessages<ChatMessage>({
      messages: incoming, metadataSchema: messageMetadataSchema.optional(), tools,
    });
    unsubscribe = await subscribe(`converse:stop:${streamId}`, () => controller.abort());
    claimed = await beginStream(user.id, id, streamId, merged);
    if (!claimed) { await unsubscribe(); return new Response("Chat is already streaming. Please retry.", { status: 409 }); }
    const title = isNew ? generateTitle(message.parts.map(part => part.text).join(""), budget, controller.signal) : undefined;
    const reasoningStarts = new Map<string, number>();
    let reasoningMs = 0;
    const stream = createUIMessageStream<ChatMessage>({
      originalMessages: merged, generateId: messageId,
      execute: async ({ writer }) => {
        const result = await converseAgent.stream({
          messages: await convertToModelMessages(prepareHistory(merged), { tools, ignoreIncompleteToolCalls: true }),
          options: { registry: createCitationRegistry(merged), budget },
          abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(110_000)]),
        });
        writer.merge(toUIMessageStream({
          stream: result.stream, tools,
          messageMetadata: ({ part }) => {
            if (part.type === "reasoning-start") reasoningStarts.set(part.id, Date.now());
            if (part.type === "reasoning-end") {
              reasoningMs += Date.now() - (reasoningStarts.get(part.id) ?? Date.now());
              reasoningStarts.delete(part.id);
            }
            if (part.type === "abort") {
              for (const start of reasoningStarts.values()) reasoningMs += Date.now() - start;
              reasoningStarts.clear();
            }
            return ["start", "reasoning-end", "finish", "abort"].includes(part.type) ? { reasoningMs } : undefined;
          }, onError: streamError,
        }));
        if (title) {
          const value = await title;
          await renameChat(user.id, id, value);
          writer.write({ type: "data-title", data: { title: value }, transient: true });
        }
      },
      onEnd: async ({ messages }) => {
        try { await saveChatIfActive(user.id, id, streamId, messages); }
        finally { await unsubscribe?.(); }
      }, onError: streamError,
    });
    let registration: Promise<void> | undefined;
    const response = createUIMessageStreamResponse({ stream,
      consumeSseStream: ({ stream: sse }) => {
        registration = streamContext.createNewResumableStream(streamId, () => batchSse(sse)).then(buffered => {
          if (buffered) void consumeStream({ stream: buffered, onError: () => console.error("Chat stream consumption failed") });
        });
      },
    });
    await registration;
    return response;
  } catch (error) {
    controller.abort();
    await unsubscribe?.().catch(() => {});
    if (claimed) await saveChatIfActive(user.id, id, streamId, merged).catch(() => {});
    if (error instanceof WeeklyBudgetExceededError) return new Response(error.message, {
      status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((error.resetsAt - Date.now()) / 1000))) },
    });
    if (error instanceof BudgetUnavailableError) return new Response(error.message, { status: 503 });
    console.error("Chat request failed");
    return new Response(genericError, { status: 500 });
  }
}
