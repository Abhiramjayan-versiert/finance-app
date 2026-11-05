import Link from "next/link";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Set new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return (
    <AuthCard title="Enter your reset code" description="If an account exists for this email, a reset code is on its way. Enter it below with your new password." footer={<Link href="/forgot-password" className="hover:text-foreground">Request a new code</Link>}>
      <ResetPasswordForm email={email} />
    </AuthCard>
  );
}
