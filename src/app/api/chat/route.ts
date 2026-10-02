import { guardChatRequest } from "@/app/lib/chat/http";
import { generateTitle } from "@/app/lib/chat/title";
import { mergeIncoming, prepareHistory } from "@/app/lib/chat/context";
import { createCitationRegistry } from "@/app/lib/chat/citations";
import { converseAgent } from "@/app/lib/chat/agent";
import { beginStream, getChat, loadChat, saveChatIfActive, touchChat, renameChat } from "@/app/lib/chat/store";
import { batchSse, stopActiveStream, streamContext, subscribe } from "@/app/lib/chat/stream";
import { chatRequestSchema, messageMetadataSchema, type ChatMessage } from "@/app/lib/chat/types";
import {
  consumeStream, convertToModelMessages, createIdGenerator, createUIMessageStream, createUIMessageStreamResponse,
  generateId, toUIMessageStream, validateUIMessages,
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
  const streamId = generateId();
  const controller = new AbortController();
  let unsubscribe: (() => Promise<void>) | undefined;
  let merged: ChatMessage[] = [];
  let claimed = false;
  try {
    const previous = (await getChat(user.id, id))?.meta.activeStreamId;
    if (previous && !await stopActiveStream(user.id, id, previous)) return new Response("Previous reply is still stopping. Please retry.", { status: 409 });
    const isNew = await touchChat(user.id, id);
    const title = isNew ? generateTitle(message.parts.map(part => part.text).join(""), controller.signal) : undefined;
    const tools = converseAgent.tools;
    merged = await validateUIMessages<ChatMessage>({
      messages: mergeIncoming(await loadChat(user.id, id), message), metadataSchema: messageMetadataSchema.optional(), tools,
    });
    unsubscribe = await subscribe(`converse:stop:${streamId}`, () => controller.abort());
    claimed = await beginStream(user.id, id, streamId, merged);
    if (!claimed) { await unsubscribe(); return new Response("Chat is already streaming. Please retry.", { status: 409 }); }
    const reasoningStarts = new Map<string, number>();
    let reasoningMs = 0;
    const stream = createUIMessageStream<ChatMessage>({
      originalMessages: merged, generateId: createIdGenerator({ prefix: "msg", size: 16 }),
      execute: async ({ writer }) => {
        const result = await converseAgent.stream({
          messages: await convertToModelMessages(prepareHistory(merged), { tools, ignoreIncompleteToolCalls: true }),
          options: { registry: createCitationRegistry(merged) },
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
          }, onError: () => genericError,
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
      }, onError: () => genericError,
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
  } catch {
    controller.abort();
    await unsubscribe?.().catch(() => {});
    if (claimed) await saveChatIfActive(user.id, id, streamId, merged).catch(() => {});
    console.error("Chat request failed");
    return new Response(genericError, { status: 500 });
  }
}
