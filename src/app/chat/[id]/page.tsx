import { validateRequest } from "@/app/_auth/validate-request";
import { getChat } from "@/app/lib/chat/store";
import { chatIdSchema } from "@/app/lib/chat/types";
import { ChatWrapper } from "@/components/ChatWrapper";
import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) redirect("/start/log-in");
  const { id } = await params;
  if (!chatIdSchema.safeParse(id).success) redirect("/chat");
  const chat = await getChat(user.id, id);
  if (!chat) redirect("/chat");
  return <ChatWrapper key={id} chatId={id} initialMessages={chat.messages} resume={!!chat.meta.activeStreamId} />;
}
