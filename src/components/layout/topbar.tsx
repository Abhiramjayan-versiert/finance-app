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
      {/* Solid, compact header. No blur, so the logo and title render sharp. */}
      <header className="sticky top-0 z-30 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 px-2 sm:h-16 sm:gap-2 sm:px-6">
        <div className="contents">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
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
              <Plus /> Add something
            </Button>
          }
        />
        <Button variant="ghost" size="icon" asChild aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
          <Link href="/notifications" className="relative">
            <Bell />
            {unread > 0 ? <span className="absolute right-1.5 top-1.5 flex min-w-5 h-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
              <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{initials(name || email)}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <DropdownMenuLabel>
              <span className="block truncate text-base font-semibold text-foreground">{name || "Your account"}</span>
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
        </div>
        </div>
      </header>
      {announcement ? <div className="mx-3 mt-1 rounded-xl bg-accent-soft px-4 py-2 text-center text-xs text-accent sm:mx-6 lg:ml-3">{announcement}</div> : null}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent title="Menu">
          <NavLinks onNavigate={() => setMenuOpen(false)} isAdmin={isAdmin} />
        </SheetContent>
      </Sheet>
    </>
  );
}
