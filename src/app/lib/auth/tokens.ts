import { createHash, randomBytes } from "node:crypto";
import { redis } from "../redis";

type TokenKind = "reset" | "verify";
export type TokenPayload = { userId: string; email: string };
const ttl = { reset: 30 * 60, verify: 24 * 60 * 60 };
const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
const key = (kind: TokenKind, token: string) =>
  `converse:auth:${kind}:${createHash("sha256").update(token).digest("hex")}`;

export async function createToken(kind: TokenKind, payload: TokenPayload) {
  const token = randomBytes(32).toString("base64url");
  await redis.set(key(kind, token), payload, { ex: ttl[kind] });
  return token;
}

// GETs only check existence; mail scanners cannot consume links.
export async function peekToken(kind: TokenKind, token: string) {
  return validToken(token) && (await redis.exists(key(kind, token))) === 1;
}

export async function consumeToken(kind: TokenKind, token: string): Promise<TokenPayload | null> {
  if (!validToken(token)) return null;
  return redis.getdel<TokenPayload>(key(kind, token));
}
