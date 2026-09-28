import { cookies } from "next/headers";
import { lucia } from "./lucia";

export const validateRequest = async () => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value;
  if (!sessionId) return { user: null, session: null };
  const result = await lucia.validateSession(sessionId);
  try {
    if (!result.session || result.session.fresh) {
      const cookie = result.session
        ? lucia.createSessionCookie(result.session.id)
        : lucia.createBlankSessionCookie();
      cookieStore.set(cookie.name, cookie.value, cookie.attributes);
    }
  } catch { /* Cookie mutation is unavailable during server rendering. */ }
  return result;
};
