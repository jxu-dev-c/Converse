import type { NextRequest } from "next/server";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { guardChatRequest } from "@/app/lib/chat/http";
import { chatIdSchema } from "@/app/lib/chat/types";
import { getChat } from "@/app/lib/chat/store";
import { streamContext } from "@/app/lib/chat/stream";
export const maxDuration = 60;
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await guardChatRequest(req);
  if (guard.response) return guard.response;
  const id = chatIdSchema.safeParse((await context.params).id);
  if (!id.success) return new Response("Invalid chat ID", { status: 400 });
  try {
    const chat = await getChat(guard.user.id, id.data);
    if (!chat) return new Response("Not found", { status: 404 });
    if (!chat.meta.activeStreamId) return new Response(null, { status: 204 });
    const stream = await streamContext.resumeExistingStream(chat.meta.activeStreamId);
    return stream ? new Response(stream.pipeThrough(new TextEncoderStream()), { headers: UI_MESSAGE_STREAM_HEADERS }) : new Response(null, { status: 204 });
  } catch { return new Response("Unable to resume chat", { status: 500 }); }
}
