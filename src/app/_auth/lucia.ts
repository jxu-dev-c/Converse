import { Lucia } from "lucia";
import { adapter } from "./lucia-dynamodb-adapter";
import { cookies } from "next/headers";
import { UserOutputType } from "../_schema/user";

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    expires: false,
    attributes: {
      // set to `true` when using HTTPS
      secure: process.env.NODE_ENV === "production",
    },
  },
});

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
    DatabaseUserAttributes: UserOutputType;
	}
}


export const purgeRemainingSessions = async () => {
  const oldCookie = (await cookies())?.get(lucia?.sessionCookieName)?.value;
  if (!oldCookie) return;
  await lucia.invalidateSession(oldCookie);
}