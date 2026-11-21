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
    <nav className="flex flex-col gap-4 p-3" aria-label="Main">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/80">{group.label}</p>
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
                    "press group flex items-center gap-3 rounded-2xl px-3 py-2",
                    active ? "glass text-foreground" : "text-muted hover:bg-card-2 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-2xl transition-colors",
                      active ? "bg-accent text-accent-foreground" : "bg-card-2 text-muted group-hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-sm", active && "font-medium")}>{item.label}</span>
                    <span className="block truncate text-[11px] text-muted">{item.hint}</span>
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
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 p-3 lg:flex">
      <div className="glass flex w-full flex-col rounded-[26px]">
        <div className="flex h-16 items-center px-5">
          <Logo href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-none">
          <NavLinks isAdmin={isAdmin} />
        </div>
        <p className="px-5 pb-4 pt-2 text-[11px] leading-snug text-muted">A planning tool — not a bank or brokerage.</p>
      </div>
    </aside>
  );
}
