import { validateRequest } from "@/app/_auth/validate-request";
import { redis } from "../redis";
import { Ratelimit } from "@upstash/ratelimit";
import { verifyRequestOrigin } from "lucia";
import type { NextRequest } from "next/server";
const ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "10 s"), prefix: "converse:chat:ratelimit" });
export async function guardChatRequest(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin !== null && !verifyRequestOrigin(origin, [req.headers.get("host") ?? req.nextUrl.host])) return { response: new Response("Forbidden", { status: 403 }) };
  const { user } = await validateRequest();
  if (!user) return { response: new Response("Unauthorized", { status: 401 }) };
  const { success, reset } = await ratelimit.limit(user.id);
  if (!success) return { response: new Response("Too many requests", { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) } }) };
  return { user };
}
