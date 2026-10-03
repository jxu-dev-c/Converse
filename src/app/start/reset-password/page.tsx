import Link from "next/link";
import { peekToken } from "@/app/lib/auth/tokens";
import ResetPasswordForm from "@/components/ResetPasswordForm";

export const metadata = { title: "Reset password · Converse", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  if (typeof token === "string" && await peekToken("reset", token)) {
    return <ResetPasswordForm token={token} />;
  }
  return <div className="max-w-md mx-auto flex flex-col gap-4">
    <h1 className="text-2xl font-semibold">Link expired</h1>
    <p>This password reset link is invalid or has expired.</p>
    <Link href="/start/forgot-password" className="high-light-link">Request a new link</Link>
  </div>;
}
