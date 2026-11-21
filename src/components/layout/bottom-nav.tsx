"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Calculator,
  ChevronRight,
  CreditCard,
  FileUp,
  Gauge,
  Landmark,
  LayoutDashboard,
  MoreHorizontal,
  PiggyBank,
  Plus,
  Receipt,
  Repeat,
  Settings,
  Shield,
  Tags,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { isActive } from "./sidebar";
import { QuickAdd } from "./quick-add";

/**
 * Bottom tab bar for phones and tablets (desktop uses the sidebar):
 *
 *   Home | Activity | [ + ] | Budgets | More
 *
 * Deliberately lightweight: solid background, no blur, no moving parts.
 * Only colours change on selection, so switching tabs never triggers layout.
 */

type Tab = { href: string | null; label: string; icon: LucideIcon };
const LEFT: Tab[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
];
const RIGHT: Tab[] = [
  { href: "/budgets", label: "Budgets", icon: Gauge },
  { href: null, label: "More", icon: MoreHorizontal },
];
const PRIMARY = ["/dashboard", "/transactions", "/budgets"];

type Row = { href: string; label: string; hint: string; icon: LucideIcon };
/** Everything not on the tab bar, in plain language. Only real pages. */
export const MORE_SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Your money",
    rows: [
      { href: "/goals", label: "Goals", hint: "Save up for things you want", icon: Target },
      { href: "/savings", label: "Savings pots", hint: "Emergency fund and other savings", icon: PiggyBank },
      { href: "/investments", label: "Investments", hint: "Funds, stocks, gold and more", icon: TrendingUp },
      { href: "/debts", label: "Loans & EMIs", hint: "Loans, cards and repayments", icon: CreditCard },
      { href: "/net-worth", label: "Net worth", hint: "What you own minus what you owe", icon: Landmark },
    ],
  },
  {
    title: "Money in & out",
    rows: [
      { href: "/income", label: "Income", hint: "Money you received", icon: Wallet },
      { href: "/expenses", label: "Spending", hint: "Where your money went", icon: Receipt },
      { href: "/transactions?view=recurring", label: "Recurring payments", hint: "Bills and salary that repeat", icon: Repeat },
      { href: "/transactions/import", label: "Import bank statement", hint: "Add many entries from a CSV file", icon: FileUp },
    ],
  },
  {
    title: "Tools",
    rows: [
      { href: "/reports", label: "Reports", hint: "Charts and downloads", icon: BarChart3 },
      { href: "/calculators", label: "Calculators", hint: "EMI, SIP, retirement and more", icon: Calculator },
      { href: "/achievements", label: "Achievements", hint: "Milestones you've reached", icon: Trophy },
    ],
  },
  {
    title: "App",
    rows: [
      { href: "/settings", label: "Settings", hint: "Profile, currency, security", icon: Settings },
      { href: "/settings#categories", label: "Categories", hint: "Edit your spending categories", icon: Tags },
      { href: "/notifications", label: "Notifications", hint: "Reminders and alerts", icon: Bell },
    ],
  },
];

export function BottomNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  // Show the tapped tab as selected immediately, before the next page has loaded.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  useEffect(() => {
    if (tapped && tapped.from !== pathname) setTimeout(() => setTapped(null), 0);
  }, [pathname, tapped]);

  const current = tapped && tapped.from === pathname ? tapped.href : pathname;
  const onPrimary = PRIMARY.some((h) => isActive(current, h));
  const moreActive = more || !onPrimary;

  const tab = (t: Tab) => {
    const active = t.href ? !more && isActive(current, t.href) : moreActive;
    const Icon = t.icon;
    const inner = (
      <>
        <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150", active ? "bg-accent-soft text-accent" : "text-muted")}>
          <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.9} aria-hidden />
        </span>
        <span className={cn("text-xs leading-none", active ? "font-semibold text-foreground" : "font-medium text-muted")}>{t.label}</span>
      </>
    );
    const cls = "flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring";
    if (!t.href)
      return (
        <button key="more" type="button" onClick={() => setMore(true)} className={cls} aria-haspopup="dialog" aria-expanded={more} aria-label="More sections">
          {inner}
        </button>
      );
    return (
      <Link key={t.href} href={t.href} onClick={() => setTapped({ href: t.href!, from: pathname })} aria-current={isActive(pathname, t.href) ? "page" : undefined} className={cls}>
        {inner}
      </Link>
    );
  };

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(8px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] lg:hidden"
        aria-label="Primary"
      >
        <div className="grid h-[68px] w-full max-w-[440px] grid-cols-5 items-stretch rounded-3xl border border-border bg-card px-1 shadow-[var(--shadow-md)]">
          {LEFT.map(tab)}
          <div className="flex items-center justify-center">
            <QuickAdd
              trigger={
                <button
                  type="button"
                  className="press flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-[var(--shadow-sm)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  aria-label="Add something"
                >
                  <Plus className="size-7" strokeWidth={2.4} aria-hidden />
                </button>
              }
            />
          </div>
          {RIGHT.map(tab)}
        </div>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title="More" side="bottom">
          <MoreList pathname={pathname} isAdmin={isAdmin} onNavigate={(href) => { setMore(false); setTapped({ href, from: pathname }); }} />
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Plain list of every secondary section, grouped. Used by the More sheet. */
export function MoreList({ pathname, isAdmin, onNavigate }: { pathname: string; isAdmin: boolean; onNavigate?: (href: string) => void }) {
  return (
    <div className="space-y-6 px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
      {MORE_SECTIONS.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="px-1 pb-2 text-sm font-semibold text-muted">{g.title}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {g.rows.map((n) => {
              const path = n.href.split(/[?#]/)[0];
              const here = n.href === path && isActive(pathname, path);
              return (
                <li key={n.href}>
                  <Link href={n.href} onClick={() => onNavigate?.(path)} aria-current={here ? "page" : undefined} className="flex min-h-16 items-center gap-3.5 px-4 py-3 active:bg-card-2">
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", here ? "bg-accent text-accent-foreground" : "bg-card-2 text-foreground")}>
                      <n.icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium text-foreground">{n.label}</span>
                      <span className="block text-sm text-muted">{n.hint}</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {isAdmin ? (
        <Link href="/admin" onClick={() => onNavigate?.("/admin")} className="flex min-h-16 items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-card-2"><Shield className="size-5" aria-hidden /></span>
          <span className="flex-1 text-base font-medium">Admin console</span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
