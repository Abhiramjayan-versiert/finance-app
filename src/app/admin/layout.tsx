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
      <header className="sticky top-0 z-30 bg-gradient-to-b from-background via-background/85 to-transparent px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
        <div className="relative isolate mx-auto h-14 max-w-7xl">
          {/* Glass on its own background layer so the logo and text stay crisp. */}
          <span aria-hidden className="surface absolute inset-0 -z-10 rounded-2xl" />
          <div className="relative flex h-full items-center gap-2.5 px-3 sm:px-4">
            <Logo href="/admin" />
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent" title={ws.roles.includes("super_admin") ? "Super admin" : "Admin"}><ShieldCheck className="size-3" /> {ws.roles.includes("super_admin") ? <><span className="hidden sm:inline">Super admin</span><span className="sm:hidden">Super</span></> : "Admin"}</span>
            <div className="flex-1" />
            <Link href="/dashboard" aria-label="Back to app" className="press inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium text-muted hover:bg-card-2 hover:text-foreground"><ArrowLeft className="size-3.5" /> <span className="hidden sm:inline">Back to app</span><span className="sm:hidden">App</span></Link>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-10 pt-3 sm:px-6 lg:flex-row">
        <aside className="lg:w-52 lg:shrink-0"><AdminNav /></aside>
        <main className="min-w-0 flex-1">
          <p className="mb-4 surface rounded-2xl px-3 py-2 text-xs text-muted">Privacy by design: the admin console shows account metadata and aggregate platform metrics only. Users&apos; financial records stay locked to their own accounts and are not accessible here.</p>
          {children}
        </main>
      </div>
    </div>
  );
}
