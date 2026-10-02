"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@nextui-org/react";
import { MoreHorizontal, Plus, X } from "lucide-react";
import { useChatList } from "./ChatListProvider";
import { renameChat, deleteChat } from "@/app/lib/api";
function group(timestamp: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - new Date(new Date(timestamp).setHours(0, 0, 0, 0)).getTime()) / 86400000);
  return days < 1 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "Previous 7 days" : "Older";
}
export function ChatSidebar() {
  const { chats, upsert, remove, drawer, setDrawer } = useChatList();
  const path = usePathname(); const router = useRouter();
  const [error, setError] = useState("");
  const [rename, setRename] = useState<{ id: string; title: string }>();
  async function submitRename(event: React.FormEvent) {
    event.preventDefault(); if (!rename) return;
    try { await renameChat(rename.id, rename.title); upsert(rename); setRename(undefined); setError(""); }
    catch { setError("Unable to rename chat. Please try again."); }
  }
  async function removeChat(id: string) {
    if (!confirm("Delete this conversation?")) return;
    try { await deleteChat(id); remove(id); if (path === `/chat/${id}`) router.push("/chat"); setError(""); }
    catch { setError("Unable to delete chat. It may still be streaming."); }
  }
  return <>
    {drawer && <button aria-label="Close chat drawer" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setDrawer(false)} />}
    <aside className={`${drawer ? "flex" : "hidden"} fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900 md:flex`} aria-label="Conversations">
      <div className="flex items-center justify-between"><Link href="/chat" onClick={() => { setDrawer(false); router.refresh(); }} className="flex items-center gap-2 rounded-lg p-3 font-medium"><Plus size={18} />New chat</Link><button className="md:hidden" aria-label="Close conversations" onClick={() => setDrawer(false)}><X /></button></div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {rename && <form onSubmit={submitRename} className="space-y-2 p-2"><input aria-label="Chat title" autoFocus maxLength={80} value={rename.title} onChange={event => setRename({ ...rename, title: event.target.value })} className="w-full rounded border p-2 dark:bg-zinc-800" /><Button size="sm" type="submit" isDisabled={!rename.title.trim()}>Save</Button><Button size="sm" onPress={() => setRename(undefined)}>Cancel</Button></form>}
      <div className="flex-1 overflow-y-auto">{["Today", "Yesterday", "Previous 7 days", "Older"].map(label => {
        const items = chats.filter(chat => group(chat.updatedAt) === label);
        return items.length > 0 && <section key={label}><h2 className="px-3 pt-4 text-xs text-zinc-500">{label}</h2>{items.map(chat => <div key={chat.id} className={`my-1 flex items-center rounded-lg ${path === `/chat/${chat.id}` ? "bg-zinc-200 dark:bg-zinc-700" : ""}`}>
          <Link href={`/chat/${chat.id}`} onClick={() => setDrawer(false)} className="min-w-0 flex-1 truncate p-3 text-sm">{chat.title}</Link>
          <Dropdown><DropdownTrigger><Button size="sm" isIconOnly variant="light" aria-label={`Manage ${chat.title}`}><MoreHorizontal size={16} /></Button></DropdownTrigger><DropdownMenu aria-label="Chat actions" disabledKeys={chat.activeStreamId ? ["delete"] : []}>
            <DropdownItem key="rename" onPress={() => setRename({ id: chat.id, title: chat.title })}>Rename</DropdownItem><DropdownItem key="delete" color="danger" onPress={() => { void removeChat(chat.id); }}>Delete</DropdownItem>
          </DropdownMenu></Dropdown>
        </div>)}</section>;
      })}</div>
    </aside>
  </>;
}
