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

const SHORT: Record<string, string> = { "/dashboard": "Home", "/transactions": "Activity", "/budgets": "Budgets", "/goals": "Goals" };

export function BottomNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  // Optimistic target: the lens starts sliding the instant a tab is tapped,
  // instead of waiting for the next page to finish loading.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const primary = NAV.filter((n) => MOBILE_PRIMARY.includes(n.href));
  const secondary = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href));
  const left = primary.slice(0, 2);
  const right = primary.slice(2);
  // Five equal slots: Home, Activity, +, Budgets, Goals, More (six columns).
  const slots = [...left.map((n) => n.href), "+", ...right.map((n) => n.href), "more"];
  const slotCount = slots.length;
  const current = pending && pending.from === pathname ? pending.href : pathname;
  let activeSlot = slots.findIndex((h) => h !== "+" && h !== "more" && isActive(current, h));
  if (activeSlot < 0 && (more || secondary.some((n) => isActive(current, n.href)))) activeSlot = slots.length - 1;

  const cell = "press relative z-10 flex min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 py-2.5 text-[10.5px] leading-none";
  const item = (n: (typeof NAV)[number]) => {
    const active = isActive(current, n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={() => setPending({ href: n.href, from: pathname })}
        aria-current={isActive(pathname, n.href) ? "page" : undefined}
        aria-label={n.label}
        className={cn(cell, "transition-colors duration-300", active ? "font-semibold text-accent" : "text-muted")}
      >
        <n.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
        <span className="max-w-full truncate">{SHORT[n.href] ?? n.label}</span>
      </Link>
    );
  };
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden" aria-label="Primary">
        <div data-lg="clear" className="glass-strong relative mx-auto flex h-[64px] max-w-lg items-stretch rounded-full p-1">
          {activeSlot >= 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-1 left-1 z-0 transition-transform duration-[550ms] ease-[cubic-bezier(0.34,1.35,0.64,1)] will-change-transform"
              style={{ width: `calc((100% - 8px) / ${slotCount})`, transform: `translateX(${activeSlot * 100}%)` }}
            >
              {/* Re-keyed on every move so the lens "stretches" like liquid as it slides. */}
              <span key={activeSlot} className="glass lg-squish block size-full rounded-full" />
            </span>
          ) : null}
          {left.map(item)}
          <div className="relative z-10 flex min-w-0 flex-1 basis-0 items-center justify-center">
            <QuickAdd
              trigger={
                <button className="press flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_-8px_var(--accent)]" aria-label="Add something">
                  <Plus className="size-6" />
                </button>
              }
            />
          </div>
          {right.map(item)}
          <button onClick={() => setMore(true)} className={cn(cell, "transition-colors duration-300", activeSlot === slotCount - 1 ? "font-semibold text-accent" : "text-muted")} aria-label="More sections">
            <MoreHorizontal className="size-[22px]" />
            <span>More</span>
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title="All sections" side="bottom">
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
            {secondary.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => { setMore(false); setPending({ href: n.href, from: pathname }); }} className={cn("glass press flex items-center gap-3 rounded-2xl p-3 text-left", isActive(pathname, n.href) ? "text-foreground" : "text-muted")}>
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
