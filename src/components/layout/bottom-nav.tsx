"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, LayoutDashboard, ArrowLeftRight, Gauge, MoreHorizontal, Plus, Shield, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/native";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { NAV_GROUPS } from "./nav";
import { isActive } from "./sidebar";
import { QuickAdd } from "./quick-add";

/**
 * Floating Liquid Glass dock (phones & tablets; desktop uses the sidebar).
 *
 *   Home | Activity | [ + ] | Budgets | More
 *
 * Modelled on the iOS tab bar:
 * - Press anywhere on the tabs and a clear glass lens lifts out of the bar,
 *   follows your finger, and shows the icon beneath it magnified and tinted.
 * - Release and it settles into the nearest tab as a quiet capsule.
 * - The + is fixed in the exact centre; the lens never covers it — dragging
 *   across the middle makes the lens dissolve and re-form on the other side.
 */

type Tab = { key: string; href: string | null; label: string; icon: LucideIcon; slot: 0 | 1 | 3 | 4 };
const TABS: Tab[] = [
  { key: "home", href: "/dashboard", label: "Home", icon: LayoutDashboard, slot: 0 },
  { key: "activity", href: "/transactions", label: "Activity", icon: ArrowLeftRight, slot: 1 },
  { key: "budgets", href: "/budgets", label: "Budgets", icon: Gauge, slot: 3 },
  { key: "more", href: null, label: "More", icon: MoreHorizontal, slot: 4 },
];
const BY_SLOT = new Map(TABS.map((t) => [t.slot as number, t]));
const PRIMARY_HREFS = TABS.flatMap((t) => (t.href ? [t.href] : []));
/** Everything not on the dock lives in More, grouped like the sidebar. */
const MORE_GROUPS = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !PRIMARY_HREFS.includes(i.href)) })).filter((g) => g.items.length);

const SLOTS = 5;
const PAD = 4; // row padding (px)
const LIFT = { x: 1.22, y: 1.28 }; // lens size while pressed

export function BottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  // Optimistic target so the lens settles the instant a tab is chosen.
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  const current = pending && pending.from === pathname ? pending.href : pathname;

  const onTab = TABS.find((t) => t.href && isActive(current, t.href));
  const inMore = MORE_GROUPS.some((g) => g.items.some((i) => isActive(current, i.href))) || (isAdmin && isActive(current, "/admin"));
  const activeSlot: number | null = more ? 4 : onTab ? onTab.slot : inMore ? 4 : null;

  // ---- Geometry ----
  const row = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const slotW = Math.max(0, (width - PAD * 2) / SLOTS);
  const centerOf = useCallback((slot: number) => PAD + slotW * (slot + 0.5), [slotW]);

  // ---- Press & drag ----
  const [pressed, setPressed] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const [hopKey, setHopKey] = useState(0); // re-forms the lens when it crosses the +
  const drag = useRef({ startX: 0, moved: false, side: 0 as 0 | 1, slot: -1, suppressClick: false });
  const [reduced, setReduced] = useState(false);
  // Moves across the + happen instantly (no sliding under it).
  const [jump, setJump] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!jump) return;
    let a = 0;
    const b = requestAnimationFrame(() => (a = requestAnimationFrame(() => setJump(false))));
    return () => {
      cancelAnimationFrame(b);
      cancelAnimationFrame(a);
    };
  }, [jump]);
  const crossTo = () => {
    setJump(true);
    setHopKey((k) => k + 1);
  };

  /** Clamp a finger position to the tabs on its side of the +. */
  const project = useCallback(
    (x: number) => {
      const side: 0 | 1 = x < centerOf(2) ? 0 : 1;
      const [a, b] = side === 0 ? [centerOf(0), centerOf(1)] : [centerOf(3), centerOf(4)];
      const cx = Math.min(b, Math.max(a, x));
      const slot = side === 0 ? (Math.abs(cx - a) <= Math.abs(cx - b) ? 0 : 1) : Math.abs(cx - a) <= Math.abs(cx - b) ? 3 : 4;
      return { cx, side, slot };
    },
    [centerOf],
  );

  const localX = (clientX: number) => clientX - (row.current?.getBoundingClientRect().left ?? 0);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !slotW) return;
    if ((e.target as Element).closest("[data-dock-plus]")) return;
    const p = project(localX(e.clientX));
    drag.current = { startX: e.clientX, moved: false, side: p.side, slot: p.slot, suppressClick: false };
    if (activeSlot !== null && (activeSlot < 2 ? 0 : 1) !== p.side) crossTo();
    row.current?.setPointerCapture(e.pointerId);
    setPressed(true);
    setDragX(p.cx);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressed) return;
    if (Math.abs(e.clientX - drag.current.startX) > 8) drag.current.moved = true;
    const p = project(localX(e.clientX));
    if (p.side !== drag.current.side) crossTo();
    if (p.slot !== drag.current.slot) hapticTap();
    drag.current.side = p.side;
    drag.current.slot = p.slot;
    setDragX(p.cx);
  };
  const choose = (slot: number) => {
    const t = BY_SLOT.get(slot);
    if (!t) return;
    if (!t.href) {
      setMore(true);
      return;
    }
    setPending({ href: t.href, from: pathname });
    if (!isActive(pathname, t.href)) router.push(t.href);
  };
  const release = (commit: boolean) => {
    if (!pressed) return;
    setPressed(false);
    setDragX(null);
    // Pointer input is captured by the dock, so it chooses the tab under the
    // lens itself (tap or drag); the native click that follows is swallowed.
    // Keyboard users still activate the real links/buttons.
    if (commit) {
      drag.current.suppressClick = true;
      choose(drag.current.slot);
    }
  };

  // Clear the optimistic target once the route actually changes.
  useEffect(() => {
    if (pending && pending.from !== pathname) setTimeout(() => setPending(null), 0);
  }, [pathname, pending]);

  // Tapping (or keyboard) across the + re-forms the lens instead of sliding under it.
  const prevSlot = useRef<number | null>(activeSlot);
  useEffect(() => {
    const from = prevSlot.current;
    prevSlot.current = activeSlot;
    if (!pressed && from !== null && activeSlot !== null && from < 2 !== activeSlot < 2) setTimeout(crossTo, 0);
  }, [activeSlot, pressed]);

  // ---- Lens placement ----
  const lensCx = dragX ?? (activeSlot !== null ? centerOf(activeSlot) : null);
  const showLens = lensCx !== null && slotW > 0;
  const lift = pressed && !reduced;
  const clipHalf = (slotW * (lift ? LIFT.x : 1)) / 2;
  const clip = lensCx !== null ? `inset(-12px ${Math.max(0, width - (lensCx + clipHalf))}px -12px ${Math.max(0, lensCx - clipHalf)}px round 999px)` : "none";

  const tabCls = (active: boolean) =>
    cn(
      "press relative flex h-full min-w-0 flex-col items-center justify-center gap-[3px] rounded-full text-[10.5px] leading-none outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring",
      active ? "font-semibold text-foreground" : "font-medium text-muted",
    );
  const iconCls = (active: boolean) =>
    cn("size-[22px] transition-[transform,color] duration-300 ease-out motion-reduce:transition-none", active ? "-translate-y-px scale-[1.06] text-accent" : "text-muted");

  const face = (t: Tab, active: boolean) => {
    const Icon = t.icon;
    return (
      <>
        <Icon className={iconCls(active)} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
        <span className="max-w-full truncate px-1">{t.label}</span>
      </>
    );
  };

  const tab = (t: Tab) => {
    const active = !pressed && activeSlot === t.slot;
    if (!t.href)
      return (
        <button key={t.key} type="button" onClick={() => setMore(true)} className={tabCls(active)} aria-haspopup="dialog" aria-expanded={more} aria-label="More sections">
          {face(t, active)}
        </button>
      );
    return (
      <Link
        key={t.key}
        href={t.href}
        onClick={() => setPending({ href: t.href!, from: pathname })}
        aria-current={isActive(pathname, t.href) ? "page" : undefined}
        className={tabCls(active)}
        draggable={false}
      >
        {face(t, active)}
      </Link>
    );
  };

  return (
    <>
      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(10px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] lg:hidden"
        aria-label="Primary"
      >
        <div
          className={cn(
            "pointer-events-auto relative isolate h-16 w-full max-w-[420px] transition-transform duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none",
            lift && "scale-[1.035]",
          )}
        >
          {/* Glass background layer — the only blurred layer; content above stays crisp. */}
          <span aria-hidden data-lg="clear" className="glass-strong absolute inset-0 -z-10 rounded-full" />
          <div
            ref={row}
            className="relative grid h-full touch-none select-none grid-cols-5 items-stretch p-1"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => release(true)}
            onPointerCancel={() => release(false)}
            onLostPointerCapture={() => release(false)}
            onClickCapture={(e) => {
              if (drag.current.suppressClick) {
                drag.current.suppressClick = false;
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {/* Lens: resting capsule behind the active tab, or a lifted glass bubble under the finger. */}
            {showLens ? (
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute bottom-1 left-0 top-1 will-change-transform",
                  pressed ? "z-20 duration-[120ms] ease-out" : "z-0 duration-[520ms] ease-[cubic-bezier(0.3,1.22,0.5,1)]",
                  jump || reduced ? "transition-none" : "transition-transform",
                )}
                style={{ width: slotW, transform: `translateX(${lensCx! - slotW / 2}px)` }}
              >
                <span
                  key={hopKey}
                  className={cn(
                    "block size-full rounded-full transition-[transform,background,box-shadow] duration-500 ease-[cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none",
                    hopKey ? "dock-reform" : "",
                    lift ? "dock-lens" : "dock-capsule",
                  )}
                  style={{ transform: lift ? `scale(${LIFT.x}, ${LIFT.y})` : "scale(1)" }}
                />
              </span>
            ) : null}

            {/* Magnified, tinted view of the tabs — visible only through the lifted lens. */}
            {showLens && lift ? (
              <div
                aria-hidden
                className="dock-magnify pointer-events-none absolute inset-0 z-30 grid grid-cols-5 p-1"
                style={{ clipPath: clip, WebkitClipPath: clip }}
              >
                {[0, 1, 2, 3, 4].map((s) => {
                  const t = BY_SLOT.get(s);
                  if (!t) return <span key={s} />;
                  const Icon = t.icon;
                  return (
                    <span key={s} className="flex h-full scale-[1.14] flex-col items-center justify-center gap-[3px] text-[10.5px] font-semibold leading-none text-accent">
                      <Icon className="size-[22px]" strokeWidth={2.2} />
                      <span className="max-w-full truncate px-1">{t.label}</span>
                    </span>
                  );
                })}
              </div>
            ) : null}

            {tab(TABS[0])}
            {tab(TABS[1])}
            <div className="relative z-40 flex h-full items-center justify-center" data-dock-plus>
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
                            setPending({ href: n.href, from: pathname });
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
