import { type NextRequest } from "next/server";
import { z } from "zod";
import { guardChatRequest } from "@/app/lib/chat/http";
import { chatIdSchema } from "@/app/lib/chat/types";
import { renameChat, deleteChat } from "@/app/lib/chat/store";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: NextRequest, context: Context) {
  const guard = await guardChatRequest(req);
  if (guard.response) return guard.response;
  const id = chatIdSchema.safeParse((await context.params).id);
  const body = z.object({ title: z.string().trim().min(1).max(80) }).safeParse(await req.json().catch(() => null));
  if (!id.success || !body.success) return new Response("Invalid chat request", { status: 400 });
  try {
    return await renameChat(guard.user.id, id.data, body.data.title) ? Response.json({ success: true }) : new Response("Not found", { status: 404 });
  } catch { return new Response("Unable to rename chat", { status: 500 }); }
}
export async function DELETE(req: NextRequest, context: Context) {
  const guard = await guardChatRequest(req);
  if (guard.response) return guard.response;
  const id = chatIdSchema.safeParse((await context.params).id);
  if (!id.success) return new Response("Invalid chat ID", { status: 400 });
  try {
    const result = await deleteChat(guard.user.id, id.data);
    return result === -1 ? new Response("Chat is streaming", { status: 409 }) : result ? Response.json({ success: true }) : new Response("Not found", { status: 404 });
  } catch { return new Response("Unable to delete chat", { status: 500 }); }
}
