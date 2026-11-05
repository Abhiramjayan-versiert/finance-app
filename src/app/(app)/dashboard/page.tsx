import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarClock, CreditCard, Landmark, Lightbulb, PiggyBank, Receipt, Scale, TrendingUp, Wallet, Percent, ShieldCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { formatMoney } from "@/lib/finance/money";
import { changePct } from "@/lib/finance/analytics";
import { formatDisplayDate, monthLabel } from "@/lib/finance/dates";
import { levelColor } from "@/lib/finance/budgets";
import { getOverview } from "@/server/queries/overview";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarList, IncomeExpenseChart, TrendChart } from "@/components/charts/charts";
import { TransactionList } from "@/components/transactions/transaction-list";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { EmptyState } from "@/components/shared/states";
import { GOAL_STATUS_LABEL } from "@/lib/finance/goals";
import { ASSET_CLASS_LABEL } from "@/lib/finance/investments";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const o = await getOverview(ws);
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const firstName = ws.profile.full_name.split(" ")[0];
  const hasAnyData = o.series.some((s) => s.incomeMinor || s.expenseMinor) || o.nw.totalAssetsMinor > 0 || o.nw.goals.length > 0;
  const activeGoals = o.nw.goals.filter((g) => !["cancelled", "completed"].includes(g.derivedStatus));

  return (
    <>
      <PageHeader
        title={sp.welcome ? `Welcome to FINANCE OS${firstName ? `, ${firstName}` : ""}` : `Hello${firstName ? `, ${firstName}` : ""}`}
        description={`${monthLabel(o.today.slice(0, 7))} overview · all figures from your records`}
      />

      <QuickActions />

      <section aria-label="Financial overview" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Income this month" value={m(o.thisMonth.incomeMinor)} icon={Wallet} change={changePct(o.thisMonth.incomeMinor, o.lastMonth.incomeMinor)} hint="vs last month" />
        <StatCard label="Expenses this month" value={m(o.thisMonth.expenseMinor)} icon={Receipt} change={changePct(o.thisMonth.expenseMinor, o.lastMonth.expenseMinor)} changeGood="down" hint="vs last month" />
        <StatCard label="Available balance" value={m(o.nw.cash.cash_balance_minor)} icon={Scale} hint="Tracked cash after savings & payments" highlight />
        <StatCard label="Total savings" value={m(o.totalSavingsMinor)} icon={PiggyBank} hint="Buckets + goal allocations" />
        <StatCard label="Investments" value={m(o.portfolio.currentValueMinor)} icon={TrendingUp} hint={o.portfolio.investedMinor ? `${o.portfolio.returnPct >= 0 ? "+" : ""}${o.portfolio.returnPct}% unrealised` : "Current value"} />
        <StatCard label="Outstanding debts" value={m(o.outstandingDebtMinor)} icon={CreditCard} hint={`${o.nw.debts.filter((d) => d.outstandingMinor > 0).length} active`} />
        <StatCard label="Net worth" value={m(o.nw.netWorthMinor)} icon={Landmark} hint="Assets − liabilities" />
        <StatCard label="Savings rate" value={o.thisMonth.incomeMinor ? `${o.thisMonth.savingsRatePct}%` : "—"} icon={Percent} hint={o.thisMonth.incomeMinor ? "Of this month's income" : "Add income to calculate"} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className={o.safe.shortfallMinor ? "border-warning/40" : "border-accent/30"}>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-accent" /> Safe to spend</CardTitle>
              <CardDescription>Rest of {monthLabel(o.today.slice(0, 7))} · {o.safe.daysLeft} day{o.safe.daysLeft === 1 ? "" : "s"} left</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {o.safe.shortfallMinor ? (
              <>
                <p className="text-2xl font-semibold text-warning tabular">{m(0)}<span className="text-sm font-normal text-muted"> / day</span></p>
                <p className="mt-1 text-xs text-warning">You&apos;re {m(o.safe.shortfallMinor)} short of covering this month&apos;s bills and goal savings.</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold text-accent tabular">{m(o.safe.perDayMinor)}<span className="text-sm font-normal text-muted"> / day</span></p>
                <p className="mt-1 text-xs text-muted">{m(o.safe.totalMinor)} left for the month</p>
              </>
            )}
            <dl className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
              <div className="flex justify-between"><dt className="text-muted">Available cash</dt><dd className="tabular">{m(o.nw.cash.cash_balance_minor)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">− Bills & EMIs due this month</dt><dd className="tabular">{m(o.safe.billsThisMonthMinor)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">− Goal savings still to set aside</dt><dd className="tabular">{m(o.safe.plannedSavingsMinor)}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-muted">An estimate from your records and schedules.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5"><CalendarClock className="size-4 text-muted" /> Upcoming in the next 30 days</CardTitle>
              <CardDescription>Recurring transactions and loan EMIs</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/transactions?view=recurring">Manage</Link></Button>
          </CardHeader>
          <CardContent>
            {o.upcoming.length ? (
              <ul className="divide-y divide-border">
                {o.upcoming.slice(0, 7).map((u) => (
                  <li key={u.key} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-16 shrink-0 text-xs text-muted">{formatDisplayDate(u.date, "dd MMM")}</span>
                    <Link href={u.link} className="min-w-0 flex-1 truncate hover:underline">{u.title}</Link>
                    <span className={u.kind === "recurring_income" ? "font-medium text-success tabular" : "font-medium tabular"}>{u.kind === "recurring_income" ? "+" : "−"}{m(u.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-xs text-muted">Nothing scheduled. Mark rent, salary or subscriptions as recurring, or add an EMI with a due date, to see them here.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {!hasAnyData ? (
        <EmptyState className="mt-6" icon={Lightbulb} title="Your dashboard fills in as you go" description="Add your income and a few expenses, set a budget, or create a savings goal. Every number here is calculated from your own records — nothing is estimated or made up." />
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Income vs expenses</CardTitle>
              <CardDescription>Last 12 months</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/reports">Reports <ArrowRight /></Link></Button>
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart data={o.series.map((s) => ({ label: monthLabel(s.month), incomeMinor: s.incomeMinor, expenseMinor: s.expenseMinor }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Where your money went</CardTitle>
              <CardDescription>{monthLabel(o.today.slice(0, 7))} by category</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BarList items={o.spendThis.byCategory.map((c) => ({ key: c.id ?? "none", label: c.name, valueMinor: c.amountMinor }))} emptyLabel="No expenses recorded this month" max={6} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Monthly spending trend</CardTitle>
              <CardDescription>Expenses per month</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart data={o.series.map((s) => ({ label: monthLabel(s.month), valueMinor: s.expenseMinor }))} name="Expenses" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Derived from your data</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {o.insights.length ? (
              <ul className="space-y-3">
                {o.insights.slice(0, 5).map((i) => (
                  <li key={i.id} className="flex gap-2.5">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${i.tone === "positive" ? "bg-success" : i.tone === "negative" ? "bg-danger" : i.tone === "warning" ? "bg-warning" : "bg-muted"}`} aria-hidden />
                    <div>
                      <p className="text-sm font-medium leading-snug">{i.link ? <Link href={i.link} className="hover:underline">{i.title}</Link> : i.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{i.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-xs text-muted">Insights appear once you have a month or two of records.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Budget utilisation</CardTitle>
              <CardDescription>This month</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/budgets">Manage</Link></Button>
          </CardHeader>
          <CardContent>
            {o.budgetRows.length ? (
              <ul className="space-y-3">
                {o.budgetRows.slice(0, 6).map((r) => {
                  const tone = levelColor(r.usage.level);
                  return (
                    <li key={r.budget.id}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium">{r.budget.name}</span>
                        <span className="text-muted tabular">{m(r.usage.spentMinor)} / {m(r.usage.budgetMinor)} · {r.usage.utilizationPct}%</span>
                      </div>
                      <Progress value={r.usage.utilizationPct} tone={tone} label={`${r.budget.name} budget used`} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-xs text-muted">No budgets yet. <Link className="text-accent" href="/budgets">Create one</Link></p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Goals & savings progress</CardTitle>
              <CardDescription>{activeGoals.length} active goals</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/goals">All goals</Link></Button>
          </CardHeader>
          <CardContent>
            {o.nw.goals.length || o.nw.savings.accounts.length ? (
              <ul className="space-y-3">
                {activeGoals.slice(0, 4).map((g) => (
                  <li key={g.id}>
                    <div className="mb-1 flex justify-between gap-2 text-xs">
                      <Link href={`/goals/${g.id}`} className="truncate font-medium hover:underline">{g.name}</Link>
                      <span className="shrink-0 text-muted tabular">{g.plan.progressPct}%</span>
                    </div>
                    <Progress value={g.plan.progressPct} tone={g.derivedStatus === "at_risk" ? "warning" : "accent"} />
                    <p className="mt-1 text-[11px] text-muted">{GOAL_STATUS_LABEL[g.derivedStatus]} · {m(g.plan.monthlyRequiredMinor)}/mo needed · due {formatDisplayDate(g.target_date)}</p>
                  </li>
                ))}
                {o.nw.savings.accounts.filter((a) => a.target_amount_minor).slice(0, 2).map((a) => (
                  <li key={a.id}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-muted tabular">{m(a.balanceMinor)} / {m(a.target_amount_minor!)}</span>
                    </div>
                    <Progress value={(a.balanceMinor / a.target_amount_minor!) * 100} tone="success" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-xs text-muted">No goals yet. <Link className="text-accent" href="/goals?new=1">Plan your first goal</Link></p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Investment allocation</CardTitle>
              <CardDescription>By current value</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/investments">Portfolio</Link></Button>
          </CardHeader>
          <CardContent>
            <BarList items={o.portfolio.allocation.map((a) => ({ key: a.asset_type, label: ASSET_CLASS_LABEL[a.asset_type], valueMinor: a.valueMinor }))} emptyLabel="No investments recorded" />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Your latest entries</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {o.thisMonth.expectedIncomeMinor > 0 ? <Badge variant="warning">{m(o.thisMonth.expectedIncomeMinor)} expected</Badge> : null}
            <Button variant="ghost" size="sm" asChild><Link href="/transactions">View all <ArrowRight /></Link></Button>
          </div>
        </CardHeader>
        <CardContent>
          <TransactionList transactions={o.recentTransactions} />
        </CardContent>
      </Card>
    </>
  );
}
