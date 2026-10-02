import { generateId } from "ai";
import { ChatWrapper } from "@/components/ChatWrapper";
export default function Page() { const id = generateId(); return <ChatWrapper key={id} chatId={id} initialMessages={[]} />; }
