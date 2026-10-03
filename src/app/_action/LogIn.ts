"use server";

import { after } from "next/server";
import { logIn as logInMethod } from "@/app/_controller/user";
import { startSession } from "../_auth/session";
import { verificationEmailLimit } from "@/app/lib/auth/limits";
import { createToken } from "@/app/lib/auth/tokens";
import { sendVerificationEmail } from "@/app/lib/auth/email";
import type { returnData } from "./signUp";

export async function logIn(_prevState: returnData, formData: FormData): Promise<returnData> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string") return { status: 401 };
  try {
    const result = await logInMethod({ email, password, role: "user" });
    if (result.status === 403 && result.user) {
      if (!(await verificationEmailLimit.limit(email.toLowerCase())).success) return { status: 429 };
      const userId = result.user.id;
      after(async () => {
        try {
          const token = await createToken("verify", { userId, email });
          await sendVerificationEmail(email, token);
        } catch { console.error("Auth verification email failed: background_error"); }
      });
      return { status: 403 };
    }
    if (result.status !== 200 || !result.user) return { status: result.status };
    await startSession(result.user);
    return { status: 200, userOutput: result.user };
  } catch {
    return { status: 500 };
  }
}
