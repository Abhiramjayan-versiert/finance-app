import Link from "next/link";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Set new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string; mode?: string }> }) {
  const { email = "", mode } = await searchParams;
  if (mode === "link") {
    return (
      <AuthCard title="Check your email" description="If an account exists for this email, we sent a secure link to choose a new password." footer={<Link href="/login" className="hover:text-foreground">Back to sign in</Link>}>
        <p className="text-sm text-muted">Open the link, set your new password, then sign in. The link expires after a short time.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Enter your reset code" description="If an account exists for this email, a reset code is on its way. Enter it below with your new password." footer={<Link href="/forgot-password" className="hover:text-foreground">Request a new code</Link>}>
      <ResetPasswordForm email={email} />
    </AuthCard>
  );
}
