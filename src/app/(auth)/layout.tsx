import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isBackendConfigured } from "@/lib/env";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Already signed in and verified? Skip the auth screens.
  if (isBackendConfigured()) {
    const u = await getSessionUser();
    if (u?.emailVerified) redirect("/dashboard");
  }
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="pb-6 text-center text-xs text-muted">
        <Link href="/terms" className="hover:text-foreground">Terms</Link> · <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
      </footer>
    </div>
  );
}
