"use client";
import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/app/lib/chat/types";
import { ToolActivity } from "./ToolActivity";
import { Markdown } from "./Markdown";

export function AgentActivity({ parts, running, reasoningMs }: {
  parts: ChatMessage["parts"]; running: boolean; reasoningMs?: number;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (details.current) details.current.open = running; }, [running]);
  const searches = parts.filter(part => part.type === "tool-searchDrugLabels" || (part.type === "dynamic-tool" && part.toolName === "searchDrugLabels"));
  const searching = searches.some(part => "state" in part && ["input-streaming", "input-available"].includes(part.state ?? ""));
  const label = running ? searching ? "Searching OTC labels…" : "Thinking…"
    : reasoningMs === undefined ? "Reasoning" : `Thought for ${Math.round(reasoningMs / 1000)}s`;
  return <details ref={details} className="rounded-lg border border-zinc-300 p-3 text-sm text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
    <summary className={`cursor-pointer ${running ? "animate-pulse motion-reduce:animate-none" : ""}`}>{label}{!running && searches.length > 0 ? ` · ${searches.length} ${searches.length === 1 ? "search" : "searches"}` : ""}</summary>
    <div className="mt-3 space-y-3">{parts.map((part, index) => {
      if (part.type === "reasoning") return <Markdown key={index} content={part.text} />;
      if (part.type === "tool-searchDrugLabels" || (part.type === "dynamic-tool" && part.toolName === "searchDrugLabels")) return <ToolActivity key={part.toolCallId} part={part} isStreaming={running} />;
      return null;
    })}</div>
  </details>;
}
