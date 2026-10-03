"use server";

import { after } from "next/server";
import { addUser } from "@/app/_controller/user";
import { isStrongPassword } from "@/app/lib/password";
import { clientIp, signUpIpLimit, verificationEmailLimit } from "@/app/lib/auth/limits";
import { createToken } from "@/app/lib/auth/tokens";
import { sendAccountExistsEmail, sendVerificationEmail } from "@/app/lib/auth/email";
import validate from "@/app/lib/validate";
import type { UserOutputType } from "../_schema/user";

export interface returnData {
  userOutput?: UserOutputType | null;
  status?: number;
  message?: string;
}

export async function signUp(_prevState: returnData, formData: FormData): Promise<returnData> {
  const email = formData.get("email");
  const password = formData.get("password");
  try {
    if (!(await signUpIpLimit.limit(await clientIp())).success) return { status: 429 };
    if (typeof email !== "string" || !validate(email, "email")
      || typeof password !== "string" || !isStrongPassword(password)) {
      return { status: 400, message: "Please enter a valid email and a password that meets all requirements." };
    }
    // Both limits precede the conditional user write, regardless of account existence.
    if (!(await verificationEmailLimit.limit(email.toLowerCase())).success) return { status: 429 };
    const result = await addUser({ email, password, role: "user" });
    if (result.status !== 409 && !result.userOutput) return { status: 500 };
    after(async () => {
      try {
        if (result.status === 409) await sendAccountExistsEmail(email);
        else {
          const token = await createToken("verify", { userId: result.userOutput!.id!, email });
          await sendVerificationEmail(email, token);
        }
      } catch { console.error("Auth signup email failed: background_error"); }
    });
    return { status: 202 };
  } catch {
    return { status: 500 };
  }
}
