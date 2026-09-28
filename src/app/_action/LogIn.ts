"use server";

import { logIn as logInMethod } from "@/app/_controller/user";
import { lucia, purgeRemainingSessions } from "../_auth/lucia";
import { type returnData } from "./signUp";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { UserType } from "../_schema/user";

export async function logIn(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = "user";

  let returnedData: returnData;

  const result = await logInMethod({ email, password, role } as UserType).catch(
    (err) => {
      return { status: 500, user: null, error: err };
    }
  );
  // TODO: Aug27
  if (!result.user) {
    returnedData = {
      userOutput: null,
      status: result.status,
    }
    return returnedData;
  }
  const userId = result.user.id;
  const userRole = result.user.role;
  const userEmail = result.user.email;
  const session = await lucia.createSession(userId as string, {
    email: userEmail,
    role: userRole,
  });
  const luciaCookie = lucia.createSessionCookie(session.id);
  await (await cookies()).set(
    luciaCookie.name,
    luciaCookie.value,
    luciaCookie.attributes
  )
  returnedData = {
    userOutput: result.user,
    status: 200,
  }
  return returnedData;
}
