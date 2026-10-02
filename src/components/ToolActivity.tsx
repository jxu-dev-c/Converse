import { AlertCircle, Check, ChevronDown, LoaderCircle, Search, Square } from "lucide-react";
import type { ChatMessage } from "@/app/lib/chat/types";

type SearchPart = Extract<ChatMessage["parts"][number], { type: "tool-searchDrugLabels" | "dynamic-tool" }>;

// Presentation only: derive the trace from SDK parts without creating chat messages.
export function ToolActivity({ part, isStreaming }: { part: SearchPart; isStreaming: boolean }) {
  const pending = part.state === "input-streaming" || part.state === "input-available";
  const running = pending && isStreaming;
  const output = part.state === "output-available" ? part.output : undefined;
  const failed = part.state === "output-error"
    || (output != null && typeof output === "object" && "error" in output && !!output.error);
  const stopped = (pending && !isStreaming) || part.state === "output-denied";
  const count = output != null && typeof output === "object" && "docs" in output && Array.isArray(output.docs)
    ? output.docs.length : undefined;
  const input = part.input;
  const query = part.state !== "input-streaming" && input != null && typeof input === "object"
    && "query" in input && typeof input.query === "string" ? input.query : undefined;
  const label = failed ? "Label search unavailable" : stopped ? "Search stopped"
    : running ? "Searching OTC drug labels…" : "Searched OTC drug labels";
  const StatusIcon = failed ? AlertCircle : stopped ? Square : running ? LoaderCircle : Check;

  return (
    <details
      className="group min-w-0 rounded-lg border border-zinc-300/70 bg-white/60 text-sm text-zinc-600 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300"
      data-tool-state={running ? "running" : failed ? "failed" : stopped ? "stopped" : "completed"}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
        <StatusIcon aria-hidden="true" className={`size-4 shrink-0 ${running ? "animate-spin motion-reduce:animate-none" : ""}`} />
        <span role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1">
          {label}
          {!failed && count !== undefined && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {" · "}
              {count === 0 ? "No matches" : `${count} ${count === 1 ? "excerpt" : "excerpts"}`}
            </span>
          )}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-zinc-300/70 px-3 py-2 dark:border-zinc-600">
        {query ? (
          <div className="flex items-start gap-2">
            <Search aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 break-words">{query}</span>
          </div>
        ) : <span>{running ? "Preparing search query…" : "No search query available."}</span>}
      </div>
    </details>
  );
}
