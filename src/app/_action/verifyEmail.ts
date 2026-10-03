"use server";

import { redirect } from "next/navigation";
import { getUserbyEmail, markEmailVerified } from "@/app/_controller/user";
import { consumeToken } from "@/app/lib/auth/tokens";
import { startSession } from "../_auth/session";
import type { returnData } from "./signUp";

export async function confirmEmail(_prev: returnData, formData: FormData): Promise<returnData> {
  const token = formData.get("token");
  if (typeof token !== "string") return { status: 400, message: "Link expired. Log in to get a new link." };
  try {
    const payload = await consumeToken("verify", token);
    if (!payload) return { status: 400, message: "Link expired. Log in to get a new link." };
    await markEmailVerified(payload.email, payload.userId);
    const { Item: user } = await getUserbyEmail(payload.email);
    if (!user || user.id !== payload.userId) return { status: 400, message: "Link expired. Log in to get a new link." };
    await startSession({ id: payload.userId, email: payload.email, role: user.role });
  } catch {
    return { status: 500, message: "Unable to confirm your email. Log in to get a new link." };
  }
  redirect("/chat");
}
