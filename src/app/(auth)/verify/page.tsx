import Link from "next/link";
import type { Metadata } from "next";
import { VerifyForm } from "@/components/auth/auth-forms";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string; sent?: string }> }) {
  const { email = "", sent } = await searchParams;
  return (
    <AuthCard
      title="Verify your email"
      description={
        email ? (
          <>{sent ? "We sent" : "Enter"} a one-time code {sent ? "to" : "sent to"} <span className="font-medium text-foreground">{email}</span>. Codes expire after a short time for your security.</>
        ) : (
          "Enter the email you registered with and the one-time code we sent you."
        )
      }
      footer={<Link href="/login" className="hover:text-foreground">Back to sign in</Link>}
    >
      <VerifyForm email={email} />
    </AuthCard>
  );
}
