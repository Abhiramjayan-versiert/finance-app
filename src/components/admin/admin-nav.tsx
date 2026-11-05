"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, FileClock, HeartPulse, LayoutDashboard, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/activity", label: "User activity", icon: Activity },
  { href: "/admin/analytics", label: "Platform analytics", icon: BarChart3 },
  { href: "/admin/health", label: "System health", icon: HeartPulse },
  { href: "/admin/audit", label: "Audit logs", icon: FileClock },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col" aria-label="Admin">
      {NAV.map((n) => {
        const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm", active ? "bg-card-2 font-medium" : "text-muted hover:text-foreground")}>
            <n.icon className={cn("size-4", active && "text-accent")} /> {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
