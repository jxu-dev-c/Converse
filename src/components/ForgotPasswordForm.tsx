"use client";

import { useActionState } from "react";
import { Button, Input } from "@nextui-org/react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/_action/passwordReset";

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});
  return (
    <form action={action} className="max-w-md w-full mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Forgot password?</h1>
      {state.status === 202 ? <p role="status">{state.message}</p> : <>
        <p>Enter your email to request a password reset link.</p>
        <Input name="email" type="email" label="Email" variant="bordered" size="lg" autoComplete="email" isRequired />
        <Button type="submit" color="primary" size="lg" isLoading={pending}>Send reset link</Button>
        {state.status && <p role="alert">{state.status === 429 ? "Too many attempts. Please try again later." : state.message}</p>}
      </>}
      <Link href="/start/log-in" className="high-light-link">Back to log in</Link>
    </form>
  );
}
