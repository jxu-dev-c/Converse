import { ChatWrapper } from "@/components/ChatWrapper";
import { validateRequest } from "../_auth/validate-request";
import { loadChat } from "../lib/chat/store";
import { CHAT_ID } from "../lib/chat/types";
import { redirect } from "next/navigation";

const Page = async () => {
  const { user } = await validateRequest();
  if (!user) redirect("/start/log-in");
  const initialMessages = await loadChat(user.id);
  return <ChatWrapper chatId={CHAT_ID} initialMessages={initialMessages} />;
};

export default Page;
