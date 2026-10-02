import { generateId } from "ai";
import { ChatWrapper } from "@/components/ChatWrapper";
export default function Page() { return <ChatWrapper chatId={generateId()} initialMessages={[]} />; }
