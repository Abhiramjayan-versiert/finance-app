import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/auth-forms";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; signedOut?: string; error?: string; expired?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthCard
      title="Welcome back"
      description={sp.signedOut ? "You have been signed out securely." : sp.expired ? "Your session expired. Please sign in again." : sp.error ? "That link is invalid or has expired. Please sign in." : "Sign in to your FINANCE OS workspace."}
      footer={<>New here? <Link href="/register" className="font-medium text-accent hover:underline">Create a free account</Link></>}
    >
      <LoginForm next={sp.next} />
    </AuthCard>
  );
}
