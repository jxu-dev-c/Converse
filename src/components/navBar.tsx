"use client";
import { BrainCircuit, Menu } from "lucide-react";
import { NightModeToggle } from "./NightModeToggle";
import NavDropDown from "./NavDropDown";
import { useChatList } from "./ChatListProvider";
export default function NavBar() {
  const { setDrawer } = useChatList();
  return <nav className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-white/80 px-4 backdrop-blur-md dark:bg-zinc-800/80">
    <button className="md:hidden" aria-label="Open conversations" onClick={() => setDrawer(true)}><Menu /></button>
    <BrainCircuit size={24} /><span className="mr-auto text-lg font-semibold">Converse</span><NightModeToggle /><NavDropDown />
  </nav>;
}
