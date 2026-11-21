"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, LayoutDashboard, ArrowLeftRight, Gauge, MoreHorizontal, Plus, Shield, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NAV_GROUPS } from "./nav";
import { isActive } from "./sidebar";
import { QuickAdd } from "./quick-add";

/**
 * Floating Liquid Glass dock (phones & tablets; desktop uses the sidebar).
 *
 *   Home | Activity | [ + ] | Budgets | More
 *
 * Five equal columns. The + action is fixed in the exact centre and is never
 * part of the selection. A glass capsule marks the active tab: it glides (with
 * a slight liquid stretch) between neighbours on the same side of the +, and
 * dissolves/re-forms when crossing it, so it never passes under the + button.
 */

type Tab = { key: string; href: string | null; label: string; icon: LucideIcon; slot: 0 | 1 | 3 | 4 };
const TABS: Tab[] = [
  { key: "home", href: "/dashboard", label: "Home", icon: LayoutDashboard, slot: 0 },
  { key: "activity", href: "/transactions", label: "Activity", icon: ArrowLeftRight, slot: 1 },
  { key: "budgets", href: "/budgets", label: "Budgets", icon: Gauge, slot: 3 },
  { key: "more", href: null, label: "More", icon: MoreHorizontal, slot: 4 },
];
const PRIMARY_HREFS = TABS.flatMap((t) => (t.href ? [t.href] : []));
/** Everything not on the dock lives in More, grouped like the sidebar. */
const MORE_GROUPS = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !PRIMARY_HREFS.includes(i.href)) })).filter((g) => g.items.length);

const SLOTS = 5;
const xFor = (slot: number) => `translateX(${slot * 100}%)`;

export function BottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  // Optimistic target so the capsule moves the instant a tab is tapped.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const current = pending && pending.from === pathname ? pending.href : pathname;

  const onTab = TABS.find((t) => t.href && isActive(current, t.href));
  const inMore = MORE_GROUPS.some((g) => g.items.some((i) => isActive(current, i.href))) || (isAdmin && isActive(current, "/admin"));
  const activeSlot: number | null = more ? 4 : onTab ? onTab.slot : inMore ? 4 : null;

  // ---- Capsule animation (Web Animations API, transform/opacity only) ----
  const capsule = useRef<HTMLSpanElement>(null);
  const prevSlot = useRef<number | null>(activeSlot);
  useLayoutEffect(() => {
    const el = capsule.current;
    const from = prevSlot.current;
    prevSlot.current = activeSlot;
    if (!el || activeSlot === null || from === null || from === activeSlot) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sameSide = (from < 2) === (activeSlot < 2);
    el.getAnimations().forEach((a) => a.cancel());
    if (sameSide) {
      // Glide to the neighbour with a gentle liquid stretch, settling softly.
      const mid = ((from + activeSlot) / 2) * 100;
      el.animate(
        [
          { transform: `${xFor(from)} scale(1, 1)` },
          { transform: `translateX(${mid}%) scale(1.14, 0.94)`, offset: 0.45 },
          { transform: `${xFor(activeSlot)} scale(1, 1)` },
        ],
        { duration: 460, easing: "cubic-bezier(0.32, 1.18, 0.52, 1)" },
      );
    } else {
      // Crossing the + : dissolve here, re-form there — never under the + button.
      el.animate(
        [
          { transform: `${xFor(from)} scale(1, 1)`, opacity: 1 },
          { transform: `${xFor(from)} scale(0.7, 0.82)`, opacity: 0, offset: 0.38 },
          { transform: `${xFor(activeSlot)} scale(0.7, 0.82)`, opacity: 0, offset: 0.4 },
          { transform: `${xFor(activeSlot)} scale(1.04, 0.98)`, opacity: 1, offset: 0.78 },
          { transform: `${xFor(activeSlot)} scale(1, 1)`, opacity: 1 },
        ],
        { duration: 440, easing: "cubic-bezier(0.25, 0.8, 0.35, 1)" },
      );
    }
  }, [activeSlot]);

  // Clear the optimistic target once the route actually changes.
  useEffect(() => {
    if (pending && pending.from !== pathname) setTimeout(() => setPending(null), 0);
  }, [pathname, pending]);

  const go = (href: string) => setPending({ href, from: pathname });

  const tabCls = (active: boolean) =>
    cn(
      "press relative z-10 flex h-full min-w-0 flex-col items-center justify-center gap-[3px] rounded-full text-[10.5px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "font-semibold text-foreground" : "font-medium text-muted",
    );
  const iconCls = (active: boolean) =>
    cn("size-[22px] transition-[transform,color] duration-300 ease-out motion-reduce:transition-none", active ? "-translate-y-px scale-[1.08] text-accent" : "text-muted");

  const tab = (t: Tab) => {
    const active = activeSlot === t.slot;
    const Icon = t.icon;
    const inner = (
      <>
        <Icon className={iconCls(active)} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
        <span className="max-w-full truncate px-1">{t.label}</span>
      </>
    );
    if (!t.href)
      return (
        <button key={t.key} type="button" onClick={() => setMore(true)} className={tabCls(active)} aria-haspopup="dialog" aria-expanded={more} aria-label="More sections">
          {inner}
        </button>
      );
    return (
      <Link key={t.key} href={t.href} onClick={() => go(t.href!)} aria-current={isActive(pathname, t.href) ? "page" : undefined} className={tabCls(active)}>
        {inner}
      </Link>
    );
  };

  return (
    <>
      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(10px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] lg:hidden"
        aria-label="Primary"
      >
        <div className="pointer-events-auto relative isolate h-16 w-full max-w-[420px]">
          {/* Glass background layer — the only blurred layer; content sits above it, crisp. */}
          <span aria-hidden data-lg="clear" className="glass-strong absolute inset-0 -z-10 rounded-full" />
          <div className="relative grid h-full grid-cols-5 items-stretch p-1">
            {/* Selection capsule (behind the four tabs only). */}
            {activeSlot !== null ? (
              <span
                ref={capsule}
                aria-hidden
                className="pointer-events-none absolute bottom-1 left-1 top-1 z-0 will-change-transform"
                style={{ width: `calc((100% - 8px) / ${SLOTS})`, transform: xFor(activeSlot) }}
              >
                <span className="dock-capsule block size-full rounded-full" />
              </span>
            ) : null}
            {tab(TABS[0])}
            {tab(TABS[1])}
            <div className="relative z-10 flex h-full items-center justify-center">
              <QuickAdd
                trigger={
                  <button
                    type="button"
                    className="press flex size-[50px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.15),0_6px_16px_-6px_var(--accent)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label="Add something"
                  >
                    <Plus className="size-6" strokeWidth={2.4} aria-hidden />
                  </button>
                }
              />
            </div>
            {tab(TABS[2])}
            {tab(TABS[3])}
          </div>
        </div>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title="More" side="bottom">
          <div className="space-y-5 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-1">
            {MORE_GROUPS.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{g.label}</p>
                <ul className="glass divide-y divide-border overflow-hidden rounded-2xl">
                  {g.items.map((n) => {
                    const here = isActive(pathname, n.href);
                    return (
                      <li key={n.href}>
                        <Link
                          href={n.href}
                          onClick={() => {
                            setMore(false);
                            go(n.href);
                          }}
                          aria-current={here ? "page" : undefined}
                          className="flex items-center gap-3 px-3.5 py-3 transition-colors active:bg-card-2"
                        >
                          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", here ? "bg-accent text-accent-foreground" : "bg-card-2 text-foreground")}>
                            <n.icon className="size-[18px]" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium text-foreground">{n.label}</span>
                            <span className="block truncate text-xs text-muted">{n.hint}</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {isAdmin ? (
              <Link href="/admin" onClick={() => setMore(false)} className="glass flex items-center gap-3 rounded-2xl px-3.5 py-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-card-2"><Shield className="size-[18px]" aria-hidden /></span>
                <span className="flex-1 text-[15px] font-medium">Admin console</span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
