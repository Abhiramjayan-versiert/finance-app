"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, LogOut, Menu, Moon, Plus, Settings, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Logo } from "@/components/shared/logo";
import { initials } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { NavLinks } from "./sidebar";
import { QuickAdd } from "./quick-add";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";

export function Topbar({ name, email, unread, isAdmin, announcement }: { name: string; email: string; unread: number; isAdmin: boolean; announcement?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <>
      {announcement ? <div className="border-b border-accent/30 bg-accent-soft px-4 py-2 text-center text-xs text-accent">{announcement}</div> : null}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:h-16 sm:px-6">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
          <Menu />
        </Button>
        <div className="lg:hidden">
          <Logo href="/dashboard" />
        </div>
        <div className="flex-1" />
        <OfflineIndicator />
        <QuickAdd
          trigger={
            <Button size="sm" className="hidden sm:inline-flex">
              <Plus /> Add
            </Button>
          }
        />
        <Button variant="ghost" size="icon-sm" asChild aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Link href="/notifications" className="relative">
            <Bell />
            {unread > 0 ? <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">{unread > 9 ? "9+" : unread}</span> : null}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-8 items-center justify-center rounded-full bg-card-2 text-xs font-semibold ring-1 ring-border hover:ring-border-strong" aria-label="Account menu">
              {initials(name || email)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate text-sm font-medium text-foreground">{name || "Your account"}</span>
              <span className="block truncate">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings"><User /> Profile & settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            {isAdmin ? (
              <DropdownMenuItem asChild>
                <Link href="/admin"><Settings /> Admin console</Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={async () => {
                try {
                  const { clearOfflineQueue } = await import("@/lib/offline/queue");
                  await clearOfflineQueue();
                } catch {}
                await logoutAction();
              }}
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent title="Menu">
          <NavLinks onNavigate={() => setMenuOpen(false)} isAdmin={isAdmin} />
        </SheetContent>
      </Sheet>
    </>
  );
}
