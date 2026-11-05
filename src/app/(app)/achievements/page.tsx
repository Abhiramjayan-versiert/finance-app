import type { Metadata } from "next";
import * as Icons from "lucide-react";
import { Flame, Lock } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { ACHIEVEMENTS } from "@/server/data/defaults";
import { awardAchievements, computeAchievementStats } from "@/server/maintenance";
import { achievementProgress } from "@/lib/finance/achievements";
import { currencyInfo, formatMoney } from "@/lib/finance/money";
import { formatDisplayDate, periodRange } from "@/lib/finance/dates";
import { getBudgets, getTransactions, getCategories } from "@/server/queries/finance";
import { budgetAppliesTo, computeBudgetUsage, spentForBudget } from "@/lib/finance/budgets";
import { totals } from "@/lib/finance/analytics";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Achievement } from "@/types/database";

export const metadata: Metadata = { title: "Achievements" };

const pascal = (s: string) => s.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());

export default async function AchievementsPage() {
  const ws = await requireWorkspace();
  const store = getStore();
  const factor = 10 ** currencyInfo(ws.settings.currency).exponent;
  const stats = await computeAchievementStats(store, ws.userId, ws.today, factor);
  await awardAchievements(store, ws.userId, stats, false);
  const mine = await store.list<{ awarded_at: string }>(userPath(ws.userId, "user_achievements"));
  const earned = new Map(mine.map((r) => [r.id, r.awarded_at]));
  const progress = achievementProgress(stats);
  const list: Achievement[] = ACHIEVEMENTS.map((a, i) => ({ id: a.code, code: a.code, name: a.name, description: a.description, icon: a.icon, category: "general", sort_order: i }));

  // Monthly challenges computed from this month's data.
  const month = periodRange("month", ws.today);
  const [txs, budgets, cats] = await Promise.all([getTransactions({ from: month.from, to: month.to }), getBudgets(), getCategories()]);
  const t = totals(txs, month);
  const elapsed = Number(ws.today.slice(8, 10));
  const spendDays = new Set(txs.filter((x) => x.type === "expense").map((x) => x.occurred_on));
  const noSpendDays = Math.max(0, elapsed - spendDays.size);
  const overall = budgets.find((b) => !b.expense_category_id && b.period === "monthly" && budgetAppliesTo(b, month.from, month.to));
  const overallUsage = overall ? computeBudgetUsage(overall.amount_minor, spentForBudget(overall, txs, month.from, month.to, cats.childrenOf)) : null;
  const challenges = [
    { title: "5 no-spend days", detail: `${noSpendDays} of 5 days without any expense so far`, pct: (noSpendDays / 5) * 100 },
    { title: "Save 20% of this month's income", detail: t.incomeMinor ? `Current savings rate ${t.savingsRatePct}%` : "Record this month's income to track", pct: t.incomeMinor ? (Math.max(0, t.savingsRatePct) / 20) * 100 : 0 },
    { title: "Track every day for a week", detail: `${Math.min(stats.streakDays, 7)} of 7 consecutive days`, pct: (Math.min(stats.streakDays, 7) / 7) * 100 },
    { title: "Stay within your overall budget", detail: overallUsage ? `${overallUsage.utilizationPct}% used · ${formatMoney(Math.max(0, overallUsage.remainingMinor), ws.settings.currency, { locale: ws.settings.locale })} left` : "Create an overall monthly budget to join", pct: overallUsage && overallUsage.level !== "exceeded" ? Math.min(100, (elapsed / Number(month.to.slice(8, 10))) * 100) : 0 },
  ];

  return (
    <>
      <PageHeader title="Achievements" description="Celebrate good money habits. Badges are awarded only from your real activity." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Badges earned" value={`${earned.size} / ${list.length}`} icon={Icons.Award} highlight />
        <StatCard label="Tracking streak" value={`${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"}`} icon={Flame} hint="Consecutive days with entries" />
        <StatCard label="Best savings rate" value={`${Math.round(stats.bestMonthlySavingsRatePct)}%`} icon={Icons.Percent} hint="Any complete month, last 12" />
        <StatCard label="Emergency cover" value={`${stats.emergencyFundMonths.toFixed(1)} months`} icon={Icons.LifeBuoy} />
      </section>

      <Card className="mt-4">
        <CardHeader><div><CardTitle>Monthly challenges</CardTitle><CardDescription>Healthy habits for {formatDisplayDate(ws.today, "MMMM")} — no spending required</CardDescription></div></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {challenges.map((c) => (
            <div key={c.title}>
              <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{c.title}</span><span className="text-xs text-muted">{Math.min(100, Math.round(c.pct))}%</span></div>
              <Progress value={c.pct} tone={c.pct >= 100 ? "success" : "accent"} />
              <p className="mt-1 text-xs text-muted">{c.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((a) => {
          const at = earned.get(a.id);
          const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[pascal(a.icon)] ?? Icons.Award;
          const p = progress[a.code] ?? 0;
          return (
            <Card key={a.id} className={cn("p-4", at ? "border-accent/40" : "opacity-80")}>
              <div className="flex items-start gap-3">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", at ? "bg-accent-soft text-accent" : "bg-card-2 text-muted")}>{at ? <Icon className="size-5" /> : <Lock className="size-4" />}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{a.name.replace("₹", currencyInfo(ws.settings.currency).symbol)}</p>
                  <p className="text-xs text-muted">{a.description}</p>
                  {at ? <p className="mt-1 text-[11px] text-accent">Earned {formatDisplayDate(at.slice(0, 10))}</p> : <><Progress value={p} className="mt-2" /><p className="mt-1 text-[11px] text-muted">{p}%</p></>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted">FINANCE OS never rewards spending or risky investing — achievements focus on tracking, saving and paying down debt.</p>
    </>
  );
}
