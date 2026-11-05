import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden gap-5 text-sm text-muted md:flex">
            <Link href="/#features" className="hover:text-foreground">Features</Link>
            <Link href="/tools/calculators" className="hover:text-foreground">Calculators</Link>
            <Link href="/#security" className="hover:text-foreground">Security</Link>
          </nav>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" asChild><Link href="/login">Sign in</Link></Button>
          <Button size="sm" asChild><Link href="/register">Get started free</Link></Button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} FINANCE OS · A personal financial planning tool. Not a bank, broker or financial adviser.</p>
          <div className="flex gap-4"><Link href="/terms" className="hover:text-foreground">Terms</Link><Link href="/privacy" className="hover:text-foreground">Privacy</Link><Link href="/tools/calculators" className="hover:text-foreground">Calculators</Link></div>
        </div>
      </footer>
    </div>
  );
}
