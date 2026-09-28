import { lucia } from "@/app/_auth/lucia";
import { NextRequest, NextResponse } from "next/server";
import { logIn } from "@/app/_controller/user";
import { UserType } from "@/app/_schema/user";

export const POST = async (req: NextRequest) => {
  // 1. compare password
  // if password is correct
  //   TODO
  const user: UserType = await req.json();
  const result = await logIn(user).catch((err) => {
    return { status: 500, user: null, error: err.message };
  });
  if (!result.user) {
    return NextResponse.json(
      { user: null, error: result.error },
      { status: result.status }
    );
  }
  const userId = result.user.id;
  const userRole = result.user.role;
  const userEmail = result.user.email;
  const session = await lucia.createSession(userId as string, {
    email: userEmail,
    role: userRole,
  });
  const response = NextResponse.json({ status: 200, user: result.user });
  return response;
};
