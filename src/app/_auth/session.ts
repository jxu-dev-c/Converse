import { cookies } from "next/headers";
import { lucia } from "./lucia";

export async function startSession(user: { id: string; email: string; role: string }) {
  const session = await lucia.createSession(user.id, { email: user.email, role: user.role });
  const cookie = lucia.createSessionCookie(session.id);
  (await cookies()).set(cookie.name, cookie.value, cookie.attributes);
}
