"use server";
// Need to Seperate Sign Up and Log In to different file because they can't work when put together
// https://github.com/vercel/next.js/issues/49259
// suggested method of seperating not working;
//  TODO: find out how to set cookie in a server action
import { addUser } from "@/app/_controller/user";
import { revalidatePath } from "next/cache";
import { lucia, purgeRemainingSessions } from "../_auth/lucia";
import { cookies } from "next/headers";


export interface returnData {
  userOutput?: any;
  status?: number;
}

export async function signUp(
  prevState: any,
  formData: FormData
): Promise<returnData> {
  "use server";

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = "user";
  try {
    const res = await addUser({ email, password, role });
    if (!res?.userOutput) {
      return res;
    }
    const session = await lucia.createSession(res.userOutput.id, {
      email,
      role,
    });
    const luciaCookie = lucia.createSessionCookie(session.id);
    await (await cookies()).set(luciaCookie.name, luciaCookie.value, luciaCookie.attributes);
    return res;
  } catch (err: any) {
    console.log(err);
    return {
      userOutput: null,
      status: 500,
    };
  }
}
