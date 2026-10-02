"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ChatSummary } from "@/app/lib/chat/types";
type ListState = {
  chats: ChatSummary[]; upsert: (chat: Partial<ChatSummary> & { id: string }) => void;
  remove: (id: string) => void; drawer: boolean; setDrawer: (open: boolean) => void;
};
const Context = createContext<ListState | null>(null);
export function ChatListProvider({ chats: initial, children }: { chats: ChatSummary[]; children: React.ReactNode }) {
  const [chats, setChats] = useState(initial);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setChats(initial); }, [initial]);
  const upsert = useCallback((chat: Partial<ChatSummary> & { id: string }) => setChats(current => {
    const existing = current.find(item => item.id === chat.id);
    return [{ title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), ...existing, ...chat }, ...current.filter(item => item.id !== chat.id)].sort((a, b) => b.updatedAt - a.updatedAt);
  }), []);
  const remove = (id: string) => setChats(current => current.filter(chat => chat.id !== id));
  return <Context.Provider value={{ chats, upsert, remove, drawer, setDrawer }}>{children}</Context.Provider>;
}
export function useChatList() { const context = useContext(Context); if (!context) throw new Error("Missing chat list provider"); return context; }
