import Link from "next/link";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" description="We'll email you a one-time code to set a new password." footer={<Link href="/login" className="hover:text-foreground">Back to sign in</Link>}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
