import { z } from "zod";
import type { ChatMessage } from "./types";
import type { WeeklyBudget } from "./budget";
import { jevReservationUsd, reportedJevCost } from "./cost";

const OFF_TOPIC_THRESHOLD = 0.5;
const probability = z.number().min(0).max(1);
const responseSchema = z.object({
  answers: z.object({
    scope: z.object({
      type: z.literal("choice"),
      probabilities: z.object({ medical: probability, small_talk: probability, off_topic: probability }),
    }),
  }),
});
const scope = {
  type: "choice",
  instructions: "Classify the latest user message for a medical/medication research assistant, using previous_turn only to interpret follow-ups.",
  criteria: {
    medical: "Health, medicine, drugs, symptoms, conditions, dosage, side effects, interactions, or a follow-up to the previous medical answer.",
    small_talk: "Greeting, thanks, acknowledgement, or a question about what the assistant can do.",
    off_topic: "Anything else (coding, homework, trivia, creative writing, unrelated chat).",
  },
};
const text = (message?: ChatMessage) => message?.parts.filter(part => part.type === "text").map(part => part.text).join("") ?? "";
function unavailable(reason: string): never {
  console.error("Guardrail unavailable; rejecting message", { reason });
  throw new Error(`Guardrail unavailable: ${reason}`);
}

// Throws when Jev cannot classify the message, so the request fails rather than skipping the audit.
export async function isOffTopic(message: ChatMessage, history: ChatMessage[], budget: WeeklyBudget): Promise<boolean> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) unavailable("missing_key");
  // Budget errors propagate unchanged so the route can answer with their own status.
  const reservation = await budget.reserve(jevReservationUsd());
  let response: Response;
  let raw: unknown;
  try {
    response = await fetch("https://openrouter.ai/api/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.JEV_MODEL || "jev-1.13",
        state: {
          message: text(message),
          previous_turn: {
            user: text(history.findLast(turn => turn.role === "user")).slice(0, 500),
            assistant: text(history.findLast(turn => turn.role === "assistant")).slice(0, 1000),
          },
        },
        questions: { scope },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) raw = await response.json();
  } catch (error) {
    unavailable(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "invalid_response");
  }
  // Failed calls keep their hold; the audit is charged even when it refuses a message or returns an invalid answer.
  if (!response.ok) unavailable(`http_${response.status}`);
  await reservation.settle(reportedJevCost(raw));
  const result = responseSchema.safeParse(raw);
  if (!result.success) unavailable("invalid_response");
  return result.data.answers.scope.probabilities.off_topic >= OFF_TOPIC_THRESHOLD;
}
