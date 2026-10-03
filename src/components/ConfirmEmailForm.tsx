"use client";

import { useActionState } from "react";
import { Button } from "@nextui-org/react";
import Link from "next/link";
import { confirmEmail } from "@/app/_action/verifyEmail";

export default function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmEmail, {});
  return (
    <form action={action} className="max-w-md w-full mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Confirm your email</h1>
      <p>Confirm your email to finish creating your account.</p>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" color="primary" size="lg" isLoading={pending}>Confirm my email</Button>
      {state.message && <p role="alert">{state.message}</p>}
      <Link href="/start/log-in" className="high-light-link">Back to log in</Link>
    </form>
  );
}
