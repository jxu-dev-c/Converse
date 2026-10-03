"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "@nextui-org/react";
import Link from "next/link";
import { resetPassword } from "@/app/_action/passwordReset";
import { isStrongPassword } from "@/app/lib/password";
import PasswordValidator from "./PasswordValidator";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [state, action, pending] = useActionState(resetPassword, {});
  return (
    <form action={action} className="max-w-md w-full mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <input type="hidden" name="token" value={token} />
      <Input name="password" label="New password" type="password" autoComplete="new-password" variant="bordered" size="lg" value={password} onValueChange={setPassword} isRequired />
      <PasswordValidator password={password} />
      <Button type="submit" color="primary" size="lg" isLoading={pending} isDisabled={!isStrongPassword(password)}>Reset password</Button>
      {state.message && <p role="alert">{state.message}</p>}
      <Link href="/start/forgot-password" className="high-light-link">Request a new link</Link>
    </form>
  );
}
