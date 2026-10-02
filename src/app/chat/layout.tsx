import { validateRequest } from "../_auth/validate-request";
import { listChats } from "../lib/chat/store";
import { redirect } from "next/navigation";
import { ChatListProvider } from "@/components/ChatListProvider";
import { ChatSidebar } from "@/components/ChatSidebar";
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { user } = await validateRequest();
  if (!user) redirect("/start/log-in");
  return <ChatListProvider chats={await listChats(user.id)}><div className="min-h-screen bg-gray-100 dark:bg-zinc-800"><ChatSidebar /><main className="md:ml-64">{children}</main></div></ChatListProvider>;
}
