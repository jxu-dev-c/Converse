import Link from "next/link";
import { peekToken } from "@/app/lib/auth/tokens";
import ConfirmEmailForm from "@/components/ConfirmEmailForm";

export const metadata = { title: "Confirm email · Converse", referrer: "no-referrer" };

export default async function VerifyEmailPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  if (typeof token === "string" && await peekToken("verify", token)) {
    return <ConfirmEmailForm token={token} />;
  }
  return <div className="max-w-md mx-auto flex flex-col gap-4">
    <h1 className="text-2xl font-semibold">Link expired</h1>
    <p>Log in to get a new link.</p>
    <Link href="/start/log-in" className="high-light-link">Log in</Link>
  </div>;
}
