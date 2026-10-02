import { useState, useEffect } from "react";
import { Tabs, Tab } from "@nextui-org/react";
import { BrainCircuit } from "lucide-react";
import { NightModeToggle } from "./NightModeToggle";
import { clearChatHistory } from "@/app/lib/api";
import { motion } from "framer-motion";
import NavDropDown from "./NavDropDown";

export default function Component({ reloadChat, isChatLoading }: {
  reloadChat: () => void;
  isChatLoading: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [clearError, setClearError] = useState(false);
  const clearHistory = async () => {
    if (buttonLoading || isChatLoading) return;
    setButtonLoading(true);
    setClearError(false);
    try {
      await clearChatHistory();
      reloadChat();
    } catch {
      setClearError(true);
    } finally {
      setButtonLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <motion.nav
      className="sticky top-0 z-40 backdrop-blur-md bg-white/75 dark:bg-zinc-800/75"
      layout
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex h-16 items-center px-4">
        <div className="hidden sm:flex items-center gap-2">
          <BrainCircuit className="h-6 w-6 text-black dark:text-white" />
          <span className="text-lg font-semibold text-black dark:text-white">
            Converse
          </span>
        </div>
        <div className="flex items-center mr-auto sm:ml-[32vw]">
          <Tabs aria-label="Options" className="h-full" size="lg">
            <Tab key="chat" title="Chat"></Tab>
            <Tab key="data" title="Data"></Tab>
          </Tabs>
        </div>
        <div className="flex items-center space-x-4 gap-2 text-default py-4">
          <NightModeToggle />
          {clearError && <span role="alert" className="text-sm text-red-600">Unable to clear history</span>}
          <NavDropDown
            clearHistory={clearHistory}
            buttonLoading={buttonLoading}
            clearDisabled={isChatLoading || buttonLoading}
          />
        </div>
      </div>
    </motion.nav>
  );
}
