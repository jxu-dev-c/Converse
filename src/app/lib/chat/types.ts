import type { UIMessage } from "ai";
import { z } from "zod";

export const CHAT_ID = "default";
export const messageMetadataSchema = z.object({
  sources: z.array(z.object({ id: z.string(), score: z.number() })).optional(),
});
export type ChatMessage = UIMessage<z.infer<typeof messageMetadataSchema>>;

// Only user text is accepted from the client; history and sources belong to the server.
export const chatRequestSchema = z.object({
  id: z.literal(CHAT_ID),
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
