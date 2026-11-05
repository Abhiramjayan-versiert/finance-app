import Link from "next/link";
import type { Metadata } from "next";
import { VerifyForm } from "@/components/auth/auth-forms";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string; sent?: string; mode?: string }> }) {
  const { email = "", sent, mode } = await searchParams;
  const linkMode = mode === "link";
  return (
    <AuthCard
      title="Verify your email"
      description={
        email ? (
          linkMode ? <>We sent a verification link to <span className="font-medium text-foreground">{email}</span>.</> : <>{sent ? "We sent" : "Enter"} a one-time code {sent ? "to" : "sent to"} <span className="font-medium text-foreground">{email}</span>. Codes expire after 10 minutes.</>
        ) : (
          "Enter the email you registered with and the one-time code we sent you."
        )
      }
      footer={<Link href="/login" className="hover:text-foreground">Back to sign in</Link>}
    >
      <VerifyForm email={email} mode={linkMode ? "link" : "code"} />
    </AuthCard>
  );
}
