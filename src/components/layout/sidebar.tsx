"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav";

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ onNavigate, isAdmin }: { onNavigate?: () => void; isAdmin?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 p-3" aria-label="Main">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-sm font-semibold text-muted">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={item.hint}
                  className={cn(
                    "group flex min-h-12 items-center gap-3 rounded-xl px-3 py-2",
                    active ? "bg-accent-soft text-foreground" : "text-foreground hover:bg-card-2",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-accent text-accent-foreground" : "bg-card-2 text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-base", active ? "font-semibold" : "font-medium")}>{item.label}</span>
                    <span className="block truncate text-xs text-muted">{item.hint}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      {isAdmin ? (
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm text-muted hover:bg-card-2 hover:text-foreground">
          <Shield className="size-4" /> Admin console
        </Link>
      ) : null}
    </nav>
  );
}

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-border bg-card lg:flex">
      <div className="flex w-full flex-col">
        <div className="flex h-16 items-center px-5">
          <Logo href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-none">
          <NavLinks isAdmin={isAdmin} />
        </div>
        <p className="px-5 pb-4 pt-2 text-xs leading-snug text-muted">A planning tool — not a bank or brokerage.</p>
      </div>
    </aside>
  );
}
