"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { getUserbyEmail, hashPassword, updatePassword } from "@/app/_controller/user";
import { lucia } from "../_auth/lucia";
import { startSession } from "../_auth/session";
import { isStrongPassword } from "@/app/lib/password";
import { clientIp, resetEmailLimit, resetIpLimit } from "@/app/lib/auth/limits";
import { consumeToken, createToken } from "@/app/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/app/lib/auth/email";
import validate from "@/app/lib/validate";
import type { returnData } from "./signUp";

export async function requestPasswordReset(_prev: returnData, formData: FormData): Promise<returnData> {
  const email = formData.get("email");
  try {
    if (!(await resetIpLimit.limit(await clientIp())).success) return { status: 429 };
    if (typeof email !== "string" || !validate(email, "email")) return { status: 400, message: "Please enter a valid email address." };
    if (!(await resetEmailLimit.limit(email.toLowerCase())).success) return { status: 429 };
    // Lookup and delivery both run after the response to avoid account-dependent timing.
    after(async () => {
      try {
        const { Item: user } = await getUserbyEmail(email);
        if (!user) return;
        const token = await createToken("reset", { userId: user.id, email });
        await sendPasswordResetEmail(email, token);
      } catch { console.error("Auth reset email failed: background_error"); }
    });
    return { status: 202, message: "If an account exists, we sent a link." };
  } catch {
    return { status: 500, message: "Something went wrong. Please try again." };
  }
}

export async function resetPassword(_prev: returnData, formData: FormData): Promise<returnData> {
  const password = formData.get("password");
  const token = formData.get("token");
  if (typeof password !== "string" || !isStrongPassword(password)) {
    return { status: 400, message: "Please choose a password that meets all requirements." };
  }
  if (typeof token !== "string") return { status: 400, message: "Link expired. Please request a new link." };
  try {
    const payload = await consumeToken("reset", token);
    if (!payload) return { status: 400, message: "Link expired. Please request a new link." };
    await updatePassword(payload.email, payload.userId, await hashPassword(password));
    const { Item: user } = await getUserbyEmail(payload.email);
    if (!user || user.id !== payload.userId) return { status: 400, message: "Link expired. Please request a new link." };
    await lucia.invalidateUserSessions(payload.userId);
    await startSession({ id: payload.userId, email: payload.email, role: user.role });
  } catch {
    return { status: 500, message: "Unable to reset your password. Please request a new link." };
  }
  redirect("/chat");
}
