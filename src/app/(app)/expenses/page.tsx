import type { Metadata } from "next";
import { CalendarDays, Hash, Receipt, TrendingUp, Trophy, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getCategories, getTransactions } from "@/server/queries/finance";
import { changePct, spendingSummary } from "@/lib/finance/analytics";
import { formatDisplayDate, previousRange, monthLabel, lastMonths } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { resolvePeriod } from "@/lib/period";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarList, TrendChart } from "@/components/charts/charts";
import { TransactionList } from "@/components/transactions/transaction-list";
import { PeriodNav } from "@/components/transactions/period-nav";
import { ExpenseCalendar } from "@/components/transactions/expense-calendar";
import { AddTransactionButtons } from "@/components/transactions/add-buttons";
import { monthlySeries } from "@/lib/finance/analytics";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ period?: string; date?: string; from?: string; to?: string; day?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const p = resolvePeriod(sp, ws.today);
  const prev = previousRange(p.range, p.period === "month" || p.period === "year" ? p.period : "custom");
  const calMonth = (sp.day ?? (p.period === "month" ? p.range.from : p.anchor)).slice(0, 7);
  const loadFrom = [prev.from, `${calMonth}-01`, `${lastMonths(12, ws.today)[0]}-01`].sort()[0];
  const loadTo = [p.range.to, `${calMonth}-31`, ws.today].sort().at(-1)!;
  const [txs, cats] = await Promise.all([getTransactions({ type: "expense", from: loadFrom, to: loadTo }), getCategories()]);
  const cur = spendingSummary(txs, p.range, cats.expense);
  const before = spendingSummary(txs, prev, cats.expense);
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : undefined;
  const calSummary = spendingSummary(txs, { from: `${calMonth}-01`, to: `${calMonth}-31` > loadTo ? loadTo : `${calMonth}-31` }, cats.expense);
  const byDay = Object.fromEntries(calSummary.byDay.map((d) => [d.date, d.amountMinor]));
  const listed = txs.filter((t) => (day ? t.occurred_on === day : t.occurred_on >= p.range.from && t.occurred_on <= p.range.to));
  const trend = p.period === "year" ? monthlySeries(txs, 12, p.range.to).map((s) => ({ label: monthLabel(s.month), valueMinor: s.expenseMinor })) : cur.byDay.map((d) => ({ label: formatDisplayDate(d.date, cur.byDay.length > 14 ? "dd" : "EEE dd"), valueMinor: d.amountMinor, key: d.date }));

  return (
    <>
      <PageHeader title="Expenses" description="Understand where your money goes." actions={<AddTransactionButtons only="expense" />} />
      <PeriodNav period={p.period} label={p.label} prevDate={p.prevDate} nextDate={p.nextDate} from={p.range.from} to={p.range.to} />
      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-label="Spending statistics">
        <StatCard label="Total spending" value={m(cur.totalMinor)} icon={Receipt} change={changePct(cur.totalMinor, before.totalMinor)} changeGood="down" hint="vs previous period" highlight />
        <StatCard label="Average daily" value={m(cur.averageDailyMinor)} icon={CalendarDays} />
        <StatCard label="Highest day" value={cur.highestDay ? m(cur.highestDay.amountMinor) : "—"} icon={TrendingUp} hint={cur.highestDay ? formatDisplayDate(cur.highestDay.date) : undefined} />
        <StatCard label="Top category" value={cur.topCategory?.name ?? "—"} icon={Trophy} hint={cur.topCategory ? m(cur.topCategory.amountMinor) : undefined} />
        <StatCard label="Transactions" value={String(cur.count)} icon={Hash} />
        <StatCard label="Previous period" value={m(before.totalMinor)} icon={Wallet} hint={`${formatDisplayDate(prev.from, "dd MMM")} – ${formatDisplayDate(prev.to, "dd MMM")}`} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>Spending trend</CardTitle><CardDescription>{p.label}</CardDescription></div></CardHeader>
          <CardContent>{cur.totalMinor || p.period === "year" ? <TrendChart data={trend} name="Expenses" /> : <p className="py-16 text-center text-xs text-muted">No expenses in this period</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Calendar</CardTitle><CardDescription>{monthLabel(calMonth)}</CardDescription></div></CardHeader>
          <CardContent><ExpenseCalendar month={calMonth} byDay={byDay} selected={day} /></CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><div><CardTitle>By category</CardTitle><CardDescription>Subcategories roll up to their parent</CardDescription></div></CardHeader>
          <CardContent><BarList items={cur.byCategory.map((c) => ({ key: c.id ?? "none", label: c.name, valueMinor: c.amountMinor }))} emptyLabel="No expenses in this period" /></CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>By payment method</CardTitle><CardDescription>{p.label}</CardDescription></div></CardHeader>
          <CardContent>
            <BarList
              items={Object.entries(txs.filter((t) => t.occurred_on >= p.range.from && t.occurred_on <= p.range.to).reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.payment_method]: (acc[t.payment_method] ?? 0) + t.amount_minor }), {}))
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => ({ key: k, label: PAYMENT_METHOD_LABEL[k as keyof typeof PAYMENT_METHOD_LABEL] ?? k, valueMinor: v }))}
              emptyLabel="No expenses in this period"
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader><div><CardTitle>{day ? `Expenses on ${formatDisplayDate(day)}` : "Expenses"}</CardTitle><CardDescription>{listed.length} entries · {m(listed.reduce((s, t) => s + t.amount_minor, 0))}</CardDescription></div></CardHeader>
          <CardContent><TransactionList transactions={listed.slice(0, 200)} emptyTitle={day ? "Nothing spent on this day" : "No expenses in this period"} /></CardContent>
        </Card>
      </div>
    </>
  );
}
