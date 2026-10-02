import type { InferUITools, UIMessage } from "ai";
import { z } from "zod";
import type { createSearchTools } from "./retrieval";

export const CHAT_ID = "default";
export const chatIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export type ChatSummary = { id: string; title: string; createdAt: number; updatedAt: number; activeStreamId?: string };
export const sourceSchema = z.object({ id: z.string(), score: z.number() });
export type ChatSource = z.infer<typeof sourceSchema>;
export const messageMetadataSchema = z.object({
  sources: z.array(sourceSchema).optional(),
  reasoningMs: z.number().nonnegative().optional(),
});
export type ChatTools = InferUITools<ReturnType<typeof createSearchTools>>;
export type ChatMessage = UIMessage<z.infer<typeof messageMetadataSchema>, { title: { title: string } }, ChatTools>;

// Only user text is accepted from the client; history and sources belong to the server.
export const chatRequestSchema = z.object({
  id: chatIdSchema,
  message: z.object({
    id: z.string().min(1).max(128),
    role: z.literal("user"),
    parts: z.array(z.object({ type: z.literal("text"), text: z.string() }))
      .min(1).max(10)
      .refine(parts => {
        const text = parts.map(part => part.text).join("");
        return text.trim().length > 0 && text.length <= 3000;
      }, "Message must contain 1–3000 characters"),
  }),
});
