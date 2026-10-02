import type { NextRequest } from "next/server";
import { guardChatRequest } from "@/app/lib/chat/http";
import { chatIdSchema } from "@/app/lib/chat/types";
import { getChat } from "@/app/lib/chat/store";
import { stopActiveStream } from "@/app/lib/chat/stream";
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await guardChatRequest(req);
  if (guard.response) return guard.response;
  // No snapshot (or other request body) can become server-owned history.
  if ((await req.text()).trim()) return new Response("Stop accepts no request body", { status: 400 });
  const id = chatIdSchema.safeParse((await context.params).id);
  if (!id.success) return new Response("Invalid chat ID", { status: 400 });
  try {
    const chat = await getChat(guard.user.id, id.data);
    if (!chat) return new Response("Not found", { status: 404 });
    if (!chat.meta.activeStreamId) return new Response(null, { status: 204 });
    const stopped = await stopActiveStream(guard.user.id, id.data, chat.meta.activeStreamId);
    return stopped ? new Response(null, { status: 204 }) : new Response("Reply is still stopping. Please retry.", { status: 409 });
  } catch { return new Response("Unable to stop reply", { status: 500 }); }
}
