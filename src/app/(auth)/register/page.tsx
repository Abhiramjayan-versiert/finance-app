import Link from "next/link";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/auth-forms";
import { AuthCard } from "../auth-card";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthCard title="Create your free account" description="Your private financial workspace. No card required." footer={<>Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></>}>
      <RegisterForm />
    </AuthCard>
  );
}
