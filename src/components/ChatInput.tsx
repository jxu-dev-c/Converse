import * as React from "react";
import { Button } from "@nextui-org/react";
import { MoveUpRight, Square } from "lucide-react";

export interface ChatInputProps {
  chatState: string;
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onStop: () => void;
  inputHeight?: number;
}

export default function ChatInput({
  chatState, input, onInputChange, onSubmit, onStop, inputHeight,
}: ChatInputProps) {
  const isLoading = chatState === "Loading";
  return (
    <form onSubmit={onSubmit} className="flex flex-row items-center gap-3 pb-3 px-2 h-full">
      <input
        className={`text-black ${isLoading ? "breathing" : ""} resize-none box-border border-[2px] border-gray-500/20 dark:bg-zinc-700 hover:dark:bg-zinc-600 hover:bg-gray-200 dark:text-white bg-transparent rounded-3xl focus-visible:rounded-xl focus:shadow-[0_0_0_1px_rgba(37,99,235,0.4)] focus:border-primary-500/30 focus-visible:outline-none w-full h-full py-3 px-5 transition-all duration-200`}
        style={{ height: inputHeight }}
        onChange={onInputChange}
        value={input}
        maxLength={3000}
        placeholder={isLoading ? "Generating..." : "Type a message"}
        aria-label="Message"
      />
      {isLoading ? (
        <Button isIconOnly color="primary" variant="solid" type="button" size="md" onPress={onStop} aria-label="Stop generating">
          <Square className="text-white size-[1.3em]" />
        </Button>
      ) : (
        <Button isIconOnly color="primary" variant="solid" type="submit" size="md" aria-label="Send message" className="hidden sm:flex" isDisabled={!input.trim()}>
          <MoveUpRight className="text-white size-[1.3em]" />
        </Button>
      )}
    </form>
  );
}
