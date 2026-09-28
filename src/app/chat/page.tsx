import { cookies } from "next/headers";
import { ragChat } from "../lib/rag-chat";
import { ChatWrapper } from "@/components/ChatWrapper";
import { lucia } from "../_auth/lucia";

import { validateRequest } from "../_auth/validate-request";
import { redirect } from "next/navigation";

const Page = async () => {
  const { session } = await validateRequest();
  if (!session) redirect("/start/log-in");
  const sessionCookie = session.id;
  const initialMessages = await ragChat.history.getMessages({
    amount: 10,
    sessionId: sessionCookie,
  });

  // return <div>Page</div>;
  return <ChatWrapper sessionId={sessionCookie} initialMessages={initialMessages} />;
};

export default Page;
