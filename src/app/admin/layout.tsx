import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { Logo } from "@/components/shared/logo";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · FINANCE OS" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ws = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
        <Logo href="/admin" />
        <span className="inline-flex items-center gap-1 rounded-sm bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent"><ShieldCheck className="size-3" /> {ws.roles.includes("super_admin") ? "Super admin" : "Admin"}</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"><ArrowLeft className="size-3" /> Back to app</Link>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        <aside className="lg:w-52 lg:shrink-0"><AdminNav /></aside>
        <main className="min-w-0 flex-1">
          <p className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted">Privacy by design: the admin console shows account metadata and aggregate platform metrics only. Users&apos; financial records are protected by row-level security and are not accessible here.</p>
          {children}
        </main>
      </div>
    </div>
  );
}
