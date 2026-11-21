import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarClock, Lightbulb } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { formatMoney } from "@/lib/finance/money";
import { formatDisplayDate, monthLabel } from "@/lib/finance/dates";
import { levelColor } from "@/lib/finance/budgets";
import { getOverview } from "@/server/queries/overview";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BarList, IncomeExpenseChart } from "@/components/charts/charts";
import { TransactionList } from "@/components/transactions/transaction-list";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { GetStarted, type StartStep } from "@/components/dashboard/get-started";
import { Expandable } from "@/components/shared/expandable";
import { GOAL_STATUS_LABEL } from "@/lib/finance/goals";
import { ASSET_CLASS_LABEL } from "@/lib/finance/investments";

export const metadata: Metadata = { title: "Home" };

/**
 * Home: understand your money in five seconds.
 * Balance → money in/out → monthly limit → quick actions → two tips → recent activity.
 * Everything else sits behind "More details", which is only rendered when opened.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const o = await getOverview(ws);
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const firstName = ws.profile.full_name.split(" ")[0];
  const monthName = monthLabel(o.today.slice(0, 7));
  const everIncome = o.series.some((s) => s.incomeMinor > 0);
  const everExpense = o.series.some((s) => s.expenseMinor > 0);
  const steps: StartStep[] = [
    { key: "income", title: "Add your income", why: "Your salary or any money you receive.", href: "/income", done: everIncome },
    { key: "expense", title: "Add an expense", why: "Log what you spend — it takes 10 seconds.", href: "/expenses", done: everExpense },
    { key: "budget", title: "Set a monthly limit", why: "Get warned before you overspend.", href: "/budgets", done: o.budgetRows.length > 0 },
    { key: "goal", title: "Plan a goal", why: "A phone, trip or house — see how much to save.", href: "/goals?new=1", done: o.nw.goals.length > 0 },
    { key: "savings", title: "Start a savings pot", why: "For example, an emergency fund.", href: "/savings?new=1", done: o.nw.savings.accounts.length > 0 },
    { key: "wealth", title: "Add an investment or loan", why: "Completes your net worth.", href: "/investments?new=1", done: o.nw.investments.length > 0 || o.nw.debts.length > 0 },
  ];
  const activeGoals = o.nw.goals.filter((g) => !["cancelled", "completed"].includes(g.derivedStatus));
  const overall = o.overall;
  const left = overall ? overall.usage.budgetMinor - overall.usage.spentMinor : 0;
  const kept = o.thisMonth.incomeMinor - o.thisMonth.expenseMinor;

  return (
    <div className="space-y-4">
      <div className="pb-1 pt-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">
          {sp.welcome ? `Welcome to FINANCE OS${firstName ? `, ${firstName}` : ""}` : `Hello${firstName ? `, ${firstName}` : ""}`}
        </h1>
        <p className="mt-1 text-base text-muted">Here&apos;s your money for {monthName}.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* A. Available balance */}
        <Card className="p-5 sm:p-6">
          <p className="text-sm font-medium text-muted">Available balance</p>
          <p className="mt-1 text-4xl font-bold tracking-tight tabular sm:text-5xl">{m(o.nw.cash.cash_balance_minor)}</p>
          <div className="mt-4 rounded-xl bg-card-2 px-4 py-3">
            <p className="text-sm text-muted">Safe to spend</p>
            {o.safe.shortfallMinor ? (
              <p className="mt-0.5 text-base font-semibold text-warning">
                {m(0)} / day — you&apos;re {m(o.safe.shortfallMinor)} short for this month&apos;s bills and savings
              </p>
            ) : (
              <p className="mt-0.5 text-base">
                <span className="text-xl font-semibold tabular">{m(o.safe.perDayMinor)}</span>
                <span className="text-muted"> / day for the next {o.safe.daysLeft} day{o.safe.daysLeft === 1 ? "" : "s"}</span>
              </p>
            )}
          </div>
        </Card>

        {/* B. Money in / money out */}
        <Card className="p-5 sm:p-6">
          <p className="text-sm font-medium text-muted">This month</p>
          <div className="mt-3 grid grid-cols-2 divide-x divide-border">
            <div className="pr-4">
              <p className="flex items-center gap-1.5 text-sm text-muted"><ArrowDownLeft className="size-4 text-success" aria-hidden /> Money in</p>
              <p className="mt-1 text-2xl font-semibold tabular" aria-label={`Money in this month ${m(o.thisMonth.incomeMinor)}`}>{m(o.thisMonth.incomeMinor)}</p>
            </div>
            <div className="pl-4">
              <p className="flex items-center gap-1.5 text-sm text-muted"><ArrowUpRight className="size-4 text-danger" aria-hidden /> Money out</p>
              <p className="mt-1 text-2xl font-semibold tabular" aria-label={`Money out this month ${m(o.thisMonth.expenseMinor)}`}>{m(o.thisMonth.expenseMinor)}</p>
            </div>
          </div>
          <p className="mt-4 border-t border-border pt-3 text-base text-muted">
            {o.thisMonth.incomeMinor
              ? kept >= 0
                ? <>You kept <span className="font-semibold text-foreground">{m(kept)}</span> ({o.thisMonth.savingsRatePct}% of what you earned).</>
                : <>You spent <span className="font-semibold text-danger">{m(-kept)}</span> more than you earned.</>
              : "Add your income to see how much you keep each month."}
          </p>
        </Card>
      </div>

      {/* C. Monthly limit */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">{overall?.budget.period === "yearly" ? "This year's limit" : "Monthly limit"}</p>
            {overall ? (
              <p className="mt-1 text-lg">
                You&apos;ve spent <span className="font-semibold tabular">{m(overall.usage.spentMinor)}</span> of <span className="font-semibold tabular">{m(overall.usage.budgetMinor)}</span>
              </p>
            ) : (
              <p className="mt-1 text-base">Set a spending limit and we&apos;ll warn you before you go over.</p>
            )}
          </div>
          <Button variant={overall ? "ghost" : "default"} size="sm" asChild>
            <Link href="/budgets">{overall ? "Details" : "Set a limit"}</Link>
          </Button>
        </div>
        {overall ? (
          <>
            <Progress className="mt-4 h-3" value={overall.usage.utilizationPct} tone={levelColor(overall.usage.level)} label="Monthly limit used" />
            <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-base">
              <span className={left < 0 ? "font-semibold text-danger" : "font-semibold"}>
                {left >= 0 ? `${m(left)} left` : `${m(-left)} over your limit`}
              </span>
              {overall.budget.period === "monthly" ? <span className="text-muted">{o.safe.daysLeft} day{o.safe.daysLeft === 1 ? "" : "s"} to go</span> : null}
            </div>
            {overall.usage.utilizationPct >= 90 && left >= 0 ? (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
                <AlertTriangle className="size-4 shrink-0" aria-hidden /> Careful — you&apos;ve used {overall.usage.utilizationPct}% of your limit.
              </p>
            ) : null}
          </>
        ) : null}
      </Card>

      {/* D. Quick actions */}
      <Card className="p-2 sm:p-3">
        <QuickActions />
      </Card>

      <GetStarted steps={steps} />

      {/* E. One or two tips */}
      {o.insights.length ? (
        <Card className="p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm font-medium text-muted"><Lightbulb className="size-4 text-accent" aria-hidden /> Tips for you</p>
          <ul className="mt-3 space-y-3">
            {o.insights.slice(0, 2).map((i) => (
              <li key={i.id} className="text-base">
                <p className="font-medium">{i.link ? <Link href={i.link} className="hover:underline">{i.title}</Link> : i.title}</p>
                <p className="text-sm text-muted">{i.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* F. Recent activity */}
      <Card className="p-5 sm:p-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <Button variant="ghost" size="sm" asChild><Link href="/transactions">See all <ArrowRight aria-hidden /></Link></Button>
        </div>
        <TransactionList transactions={o.recentTransactions.slice(0, 5)} emptyTitle="Nothing recorded yet" emptyDescription="Tap Add expense or Add income above to get started." />
      </Card>

      {/* Everything else — rendered only when opened. */}
      <Expandable title="More details" description="Bills coming up, charts, goals, savings and investments">
        <div className="space-y-6">
          <section>
            <h3 className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="size-4 text-muted" aria-hidden /> Coming up in the next 30 days</h3>
            {o.upcoming.length ? (
              <ul className="mt-2 divide-y divide-border">
                {o.upcoming.slice(0, 7).map((u) => (
                  <li key={u.key} className="flex items-center gap-3 py-3 text-base">
                    <span className="w-16 shrink-0 text-sm text-muted">{formatDisplayDate(u.date, "dd MMM")}</span>
                    <Link href={u.link} className="min-w-0 flex-1 truncate hover:underline">{u.title}</Link>
                    <span className={u.kind === "recurring_income" ? "font-semibold text-success tabular" : "font-semibold tabular"}>{u.kind === "recurring_income" ? "+" : "−"}{m(u.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Nothing scheduled. When you add rent, salary or a subscription, tick &ldquo;This repeats&rdquo; and it will show here.</p>
            )}
          </section>

          <section>
            <h3 className="text-base font-semibold">What you own and owe</h3>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-base">
              {[
                ["Savings", m(o.totalSavingsMinor)],
                ["Investments", m(o.portfolio.currentValueMinor)],
                ["Loans you owe", m(o.outstandingDebtMinor)],
                ["Net worth", m(o.nw.netWorthMinor)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-card-2 px-4 py-3">
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="mt-0.5 font-semibold tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="text-base font-semibold">Where your money went in {monthName}</h3>
            <div className="mt-2">
              <BarList items={o.spendThis.byCategory.map((c) => ({ key: c.id ?? "none", label: c.name, valueMinor: c.amountMinor }))} emptyLabel="No spending recorded this month" max={6} />
            </div>
          </section>

          <section>
            <h3 className="text-base font-semibold">Money in and out — last 12 months</h3>
            <div className="mt-2">
              <IncomeExpenseChart data={o.series.map((s) => ({ label: monthLabel(s.month), incomeMinor: s.incomeMinor, expenseMinor: s.expenseMinor }))} />
            </div>
          </section>

          {o.budgetRows.some((r) => r.budget.expense_category_id) ? (
            <section>
              <h3 className="text-base font-semibold">Category limits</h3>
              <ul className="mt-2 space-y-3">
                {o.budgetRows.filter((r) => r.budget.expense_category_id).slice(0, 6).map((r) => (
                  <li key={r.budget.id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="font-medium">{r.budget.name}</span>
                      <span className="text-muted tabular">{m(r.usage.spentMinor)} of {m(r.usage.budgetMinor)}</span>
                    </div>
                    <Progress value={r.usage.utilizationPct} tone={levelColor(r.usage.level)} label={`${r.budget.name} limit used`} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {activeGoals.length ? (
            <section>
              <h3 className="text-base font-semibold">Goals</h3>
              <ul className="mt-2 space-y-3">
                {activeGoals.slice(0, 4).map((g) => (
                  <li key={g.id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <Link href={`/goals/${g.id}`} className="truncate font-medium hover:underline">{g.name}</Link>
                      <span className="shrink-0 text-muted tabular">{g.plan.progressPct}%</span>
                    </div>
                    <Progress value={g.plan.progressPct} tone={g.derivedStatus === "at_risk" ? "warning" : "accent"} label={`${g.name} progress`} />
                    <p className="mt-1 text-sm text-muted">{GOAL_STATUS_LABEL[g.derivedStatus]} · save {m(g.plan.monthlyRequiredMinor)} a month · by {formatDisplayDate(g.target_date)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {o.portfolio.allocation.length ? (
            <section>
              <h3 className="text-base font-semibold">Investments by type</h3>
              <div className="mt-2">
                <BarList items={o.portfolio.allocation.map((a) => ({ key: a.asset_type, label: ASSET_CLASS_LABEL[a.asset_type], valueMinor: a.valueMinor }))} emptyLabel="No investments recorded" />
              </div>
            </section>
          ) : null}

          {o.insights.length > 2 ? (
            <section>
              <h3 className="text-base font-semibold">More tips</h3>
              <ul className="mt-2 space-y-3">
                {o.insights.slice(2, 6).map((i) => (
                  <li key={i.id} className="text-base">
                    <p className="font-medium">{i.title}</p>
                    <p className="text-sm text-muted">{i.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Expandable>
    </div>
  );
}
