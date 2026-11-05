import type { Metadata } from "next";
import { CalendarRange, Percent, PiggyBank, TrendingUp } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getGoals, getSavings, getTransactions } from "@/server/queries/finance";
import { totals } from "@/lib/finance/analytics";
import { lastMonths, monthLabel, periodRange } from "@/lib/finance/dates";
import { formatMoney, percent } from "@/lib/finance/money";
import { PageHeader } from "@/components/shared/page-header";
import { isOpeningEntry } from "@/lib/finance/opening";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineTrend } from "@/components/charts/charts";
import { SavingsAccountCard, SavingsHistory, SavingsToolbar } from "@/components/savings/savings-ui";

export const metadata: Metadata = { title: "Savings" };

export default async function SavingsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const month = periodRange("month", ws.today);
  const year = periodRange("year", ws.today);
  const [savings, goals, txs] = await Promise.all([getSavings(month.from), getGoals(ws.today), getTransactions({ from: month.from, to: month.to })]);
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const goalById = new Map(goals.map((g) => [g.id, g.name]));
  const goalAlloc = goals.filter((g) => !g.savings_account_id).reduce((s, g) => s + g.savedMinor, 0);
  const net = (from: string, to: string) =>
    savings.transactions.filter((t) => (t.type === "deposit" || t.type === "withdrawal") && !isOpeningEntry(t) && t.occurred_on >= from && t.occurred_on <= to).reduce((s, t) => s + (t.type === "deposit" ? t.amount_minor : -t.amount_minor), 0)
    + goals.flatMap((g) => g.contributions).filter((c) => !isOpeningEntry(c) && c.occurred_on >= from && c.occurred_on <= to).reduce((s, c) => s + c.amount_minor, 0);
  const monthNet = net(month.from, month.to);
  const income = totals(txs, month).incomeMinor;
  const accounts = savings.accounts.map((a) => ({ ...a, linkedGoalName: a.linkedGoalId ? goalById.get(a.linkedGoalId) ?? null : null }));
  // Savings growth: cumulative balance (buckets + goal allocations) at each month end.
  const all = [
    ...savings.transactions.map((t) => ({ date: t.occurred_on, amount: t.type === "deposit" || t.type === "transfer_in" ? t.amount_minor : -t.amount_minor })),
    ...goals.filter((g) => !g.savings_account_id).flatMap((g) => g.contributions.map((c) => ({ date: c.occurred_on, amount: c.amount_minor }))),
  ];
  const growth = lastMonths(12, ws.today).map((k) => ({ label: monthLabel(k), valueMinor: all.filter((x) => x.date <= `${k}-31`).reduce((s, x) => s + x.amount, 0) }));
  const names = Object.fromEntries(savings.accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader title="Savings" description="Virtual buckets for money you set aside. Moving money into savings is never treated as an expense." actions={<SavingsToolbar accounts={accounts} defaultOpen={sp.new === "1"} />} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total savings" value={m(savings.totalMinor + goalAlloc)} icon={PiggyBank} hint={goalAlloc ? `incl. ${m(goalAlloc)} in goals` : "Across all buckets"} highlight />
        <StatCard label="Saved this month" value={m(monthNet)} icon={TrendingUp} hint="Net deposits" />
        <StatCard label={`Saved in ${ws.today.slice(0, 4)}`} value={m(net(year.from, year.to))} icon={CalendarRange} />
        <StatCard label="Savings rate" value={income ? `${percent(monthNet, income, 1)}%` : "—"} icon={Percent} hint={income ? "Of this month's income" : "Needs income this month"} />
      </section>
      {accounts.length === 0 ? (
        <EmptyState className="mt-6" icon={PiggyBank} title="Create your first savings bucket" description="Emergency fund, vacation, laptop, car, house deposit or education — each with its own target." />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => <SavingsAccountCard key={a.id} account={a} />)}
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>Savings growth</CardTitle><CardDescription>Total saved at each month end</CardDescription></div></CardHeader>
          <CardContent><LineTrend data={growth} name="Savings" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>History</CardTitle><CardDescription>Latest savings activity</CardDescription></div></CardHeader>
          <CardContent><SavingsHistory items={savings.transactions.slice(0, 50)} names={names} /></CardContent>
        </Card>
      </div>
    </>
  );
}
