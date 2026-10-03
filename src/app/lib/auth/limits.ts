import { Ratelimit } from "@upstash/ratelimit";
import { headers } from "next/headers";
import { redis } from "../redis";

export const resetEmailLimit = new Ratelimit({
  redis, limiter: Ratelimit.slidingWindow(3, "15 m"), prefix: "converse:auth:reset-email",
});
export const resetIpLimit = new Ratelimit({
  redis, limiter: Ratelimit.slidingWindow(10, "15 m"), prefix: "converse:auth:reset-ip",
});
export const verificationEmailLimit = new Ratelimit({
  redis, limiter: Ratelimit.slidingWindow(3, "15 m"), prefix: "converse:auth:verification-email",
});
export const signUpIpLimit = new Ratelimit({
  redis, limiter: Ratelimit.slidingWindow(5, "15 m"), prefix: "converse:auth:signup-ip",
});

export async function clientIp() {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0].trim()
    || requestHeaders.get("x-real-ip") || "unknown";
}
