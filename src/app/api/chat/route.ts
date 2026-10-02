import { validateRequest } from "@/app/_auth/validate-request";
import { mergeIncoming, prepareHistory } from "@/app/lib/chat/context";
import { converseAgent } from "@/app/lib/chat/agent";
import { clearChat, loadChat, saveChat } from "@/app/lib/chat/store";
import { chatRequestSchema, messageMetadataSchema, type ChatMessage } from "@/app/lib/chat/types";
import { redis } from "@/app/lib/redis";
import { Ratelimit } from "@upstash/ratelimit";
import {
  convertToModelMessages, createIdGenerator, createUIMessageStreamResponse,
  toUIMessageStream, validateUIMessages,
} from "ai";
import { type NextRequest } from "next/server";
import { verifyRequestOrigin } from "lucia";

export const maxDuration = 120;
const ratelimit = new Ratelimit({
  redis, limiter: Ratelimit.slidingWindow(10, "10 s"), prefix: "converse:chat:ratelimit",
});
const genericError = "Unable to complete the response. Please try again.";

function hasForeignOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  // Next may construct nextUrl using the bind address (e.g. 0.0.0.0).
  // Host identifies the public address used by the browser.
  return origin !== null && !verifyRequestOrigin(origin, [req.headers.get("host") ?? req.nextUrl.host]);
}

export async function POST(req: NextRequest) {
  if (hasForeignOrigin(req)) return new Response("Forbidden", { status: 403 });
  const { user } = await validateRequest();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { success, reset } = await ratelimit.limit(user.id);
  if (!success) return new Response("Too many requests", {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) },
  });

  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid chat request", { status: 400 });
  const { id, message } = parsed.data;

  try {
    const tools = converseAgent.tools;
    const merged = await validateUIMessages<ChatMessage>({
      messages: mergeIncoming(await loadChat(user.id, id), message),
      metadataSchema: messageMetadataSchema.optional(),
      tools,
    });
    const window = prepareHistory(merged);

    const result = await converseAgent.stream({
      messages: await convertToModelMessages(window, { tools, ignoreIncompleteToolCalls: true }),
      abortSignal: req.signal,
    });
    const reasoningStarts = new Map<string, number>();
    let reasoningMs = 0;
    // Drain the provider independently; the UI stream's onEnd also runs on cancellation.
    void result.consumeStream({ onError: () => console.error("Chat stream consumption failed") });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        tools,
        originalMessages: merged,
        generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
        messageMetadata: ({ part }) => {
          if (part.type === "reasoning-start") reasoningStarts.set(part.id, Date.now());
          if (part.type === "reasoning-end") {
            reasoningMs += Date.now() - (reasoningStarts.get(part.id) ?? Date.now());
            reasoningStarts.delete(part.id);
          }
          return ["start", "reasoning-end", "finish"].includes(part.type) ? { reasoningMs } : undefined;
        },
        onEnd: async ({ messages }) => {
          await saveChat(user.id, messages, id);
        },
        onError: () => genericError,
      }),
    });
  } catch {
    console.error("Chat request failed");
    return new Response(genericError, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (hasForeignOrigin(req)) return new Response("Forbidden", { status: 403 });
  const { user } = await validateRequest();
  if (!user) return new Response("Unauthorized", { status: 401 });
  try {
    await clearChat(user.id);
    return Response.json({ success: true });
  } catch {
    return new Response("Unable to clear chat history", { status: 500 });
  }
}
