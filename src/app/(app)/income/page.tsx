import type { Metadata } from "next";
import { Clock, Repeat, TrendingUp, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getCategories, getRecurring, getTransactions } from "@/server/queries/finance";
import { changePct, incomeBySource, monthlySeries, totals } from "@/lib/finance/analytics";
import { lastMonths, monthLabel, periodRange, previousRange } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList, TrendChart } from "@/components/charts/charts";
import { TransactionList } from "@/components/transactions/transaction-list";
import { TransactionFilters } from "@/components/transactions/filters";
import { AddTransactionButtons } from "@/components/transactions/add-buttons";
import { RecurringList } from "@/components/transactions/recurring-list";
import { filtersFrom } from "@/lib/filters";

export const metadata: Metadata = { title: "Income" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const f = filtersFrom(sp);
  const yearAgo = `${lastMonths(12, ws.today)[0]}-01`;
  const [all, cats, recurring] = await Promise.all([getTransactions({ type: "income" }), getCategories(), getRecurring()]);
  const month = periodRange("month", ws.today);
  const year = periodRange("year", ws.today);
  const cm = totals(all, month);
  const pm = totals(all, previousRange(month, "month"));
  const yr = totals(all, year);
  const expected = all.filter((t) => t.status === "expected");
  const filtered = await getTransactions({ ...f, type: "income" });
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const series = monthlySeries(all.filter((t) => t.occurred_on >= yearAgo), 12, ws.today);

  return (
    <>
      <PageHeader title="Income" description="Track income from every source. Expected income is shown separately and never counted as cash received." actions={<AddTransactionButtons only="income" />} />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Received this month" value={m(cm.incomeMinor)} icon={Wallet} change={changePct(cm.incomeMinor, pm.incomeMinor)} hint="vs last month" highlight />
        <StatCard label={`Received in ${ws.today.slice(0, 4)}`} value={m(yr.incomeMinor)} icon={TrendingUp} />
        <StatCard label="Expected (not received)" value={m(expected.reduce((s, t) => s + t.amount_minor, 0))} icon={Clock} hint={`${expected.length} upcoming`} />
        <StatCard label="Recurring income rules" value={String(recurring.filter((r) => r.type === "income" && r.is_active).length)} icon={Repeat} />
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>Monthly income</CardTitle><CardDescription>Received income, last 12 months</CardDescription></div></CardHeader>
          <CardContent><TrendChart data={series.map((s) => ({ label: monthLabel(s.month), valueMinor: s.incomeMinor }))} name="Income" color="var(--series-1)" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Income sources</CardTitle><CardDescription>This year</CardDescription></div></CardHeader>
          <CardContent><BarList items={incomeBySource(all, year, cats.income).map((c) => ({ key: c.id ?? "none", label: c.name, valueMinor: c.amountMinor }))} emptyLabel="No income recorded this year" /></CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader><div><CardTitle>Recurring income</CardTitle></div></CardHeader>
        <CardContent><RecurringList rules={recurring.filter((r) => r.type === "income")} /></CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader className="flex-col items-stretch"><CardTitle>All income</CardTitle><TransactionFilters kind="income" /></CardHeader>
        <CardContent><TransactionList transactions={filtered.slice(0, 300)} emptyTitle="No income found" /></CardContent>
      </Card>
    </>
  );
}
