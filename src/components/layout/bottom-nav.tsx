"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MOBILE_PRIMARY, NAV } from "./nav";
import { isActive } from "./sidebar";
import { QuickAdd } from "./quick-add";

export function BottomNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.href));
  const secondary = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href));
  const left = primary.slice(0, 2);
  const right = primary.slice(2);
  const item = (n: (typeof NAV)[number]) => {
    const active = isActive(pathname, n.href);
    return (
      <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px]", active ? "text-foreground" : "text-muted")}>
        <n.icon className={cn("size-5", active && "text-accent")} />
        <span className="truncate">{n.label.replace("Financial ", "")}</span>
      </Link>
    );
  };
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-2 safe-bottom lg:hidden" aria-label="Primary">
        <div className="glass-strong mx-auto flex max-w-lg items-stretch rounded-[22px] px-1">
          {left.map(item)}
          <div className="flex flex-1 items-center justify-center">
            <QuickAdd
              trigger={
                <button className="-mt-4 flex size-13 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[0_8px_24px_-6px_var(--accent)] ring-4 ring-background/70" aria-label="Add something">
                  <Plus className="size-6" />
                </button>
              }
            />
          </div>
          {right.map(item)}
          <button onClick={() => setMore(true)} className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted" aria-label="More sections">
            <MoreHorizontal className="size-5" />
            More
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title="All sections" side="bottom">
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
            {secondary.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setMore(false)} className={cn("glass flex items-center gap-3 rounded-2xl p-3 text-left", isActive(pathname, n.href) ? "text-foreground" : "text-muted")}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card-2"><n.icon className="size-4.5" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">{n.label}</span>
                  <span className="block truncate text-[11px]">{n.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
