import { type NextRequest } from "next/server";
import { guardChatRequest } from "@/app/lib/chat/http";
import { WeeklyBudget } from "@/app/lib/chat/budget";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const guard = await guardChatRequest(req);
    if (guard.response) {
      guard.response.headers.set("Cache-Control", headers["Cache-Control"]);
      return guard.response;
    }
    return Response.json(await new WeeklyBudget(guard.user.id).getSnapshot(), { headers });
  } catch {
    return new Response("Unable to load AI usage. Please try again later.", { status: 503, headers });
  }
}
