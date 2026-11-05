"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ onNavigate, isAdmin }: { onNavigate?: () => void; isAdmin?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Main">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-card-2 font-medium text-foreground" : "text-muted hover:bg-card-2/60 hover:text-foreground",
            )}
          >
            <item.icon className={cn("size-4", active && "text-accent")} />
            {item.label}
          </Link>
        );
      })}
      {isAdmin ? (
        <Link href="/admin" onClick={onNavigate} className="mt-2 flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground">
          <Shield className="size-4" /> Admin console
        </Link>
      ) : null}
    </nav>
  );
}

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-background-2 lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" />
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks isAdmin={isAdmin} />
      </div>
      <p className="px-5 pb-4 text-[11px] text-muted">A planning tool — not a bank or brokerage.</p>
    </aside>
  );
}
