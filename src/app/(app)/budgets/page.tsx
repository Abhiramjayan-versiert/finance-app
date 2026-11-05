import type { Metadata } from "next";
import { Gauge } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getBudgets, getCategories, getTransactions } from "@/server/queries/finance";
import { budgetAppliesTo, computeBudgetUsage, spentForBudget } from "@/lib/finance/budgets";
import { addMonthsISO, lastMonths, monthLabel, periodRange } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { BudgetCard, NewBudgetButton } from "@/components/budgets/budget-ui";
import { PeriodNav } from "@/components/transactions/period-nav";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const anchor = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : ws.today;
  const month = periodRange("month", anchor);
  const year = periodRange("year", anchor);
  const months = lastMonths(6, anchor);
  const from = [`${months[0]}-01`, year.from].sort()[0];
  const [budgets, cats, txs] = await Promise.all([getBudgets(), getCategories(), getTransactions({ type: "expense", from, to: year.to })]);
  const catName = (id: string | null) => (id ? cats.expense.find((c) => c.id === id)?.name ?? "Category" : "All spending");
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });

  const rows = budgets
    .map((b) => {
      const range = b.period === "monthly" ? month : year;
      if (!budgetAppliesTo(b, range.from, range.to)) return null;
      return { b, usage: computeBudgetUsage(b.amount_minor, spentForBudget(b, txs, range.from, range.to, cats.childrenOf), b.thresholds), label: b.period === "monthly" ? monthLabel(anchor.slice(0, 7)) : anchor.slice(0, 4) };
    })
    .filter(Boolean) as Array<{ b: (typeof budgets)[number]; usage: ReturnType<typeof computeBudgetUsage>; label: string }>;
  const monthly = budgets.filter((b) => b.period === "monthly");
  const totalBudget = rows.filter((r) => r.b.period === "monthly" && r.b.expense_category_id).reduce((s, r) => s + r.usage.budgetMinor, 0);

  return (
    <>
      <PageHeader title="Budgets" description="Set monthly and yearly limits and get warned before you overspend." actions={<NewBudgetButton />} />
      <PeriodNav period="month" label={monthLabel(anchor.slice(0, 7))} prevDate={addMonthsISO(anchor, -1)} nextDate={addMonthsISO(anchor, 1)} from={month.from} to={month.to} showTabs={false} />
      {budgets.length === 0 ? (
        <EmptyState className="mt-4" icon={Gauge} title="No budgets yet" description="Example: overall ₹30,000/month with Food ₹6,000, Transport ₹3,000, Shopping ₹5,000 and Entertainment ₹2,000." action={<NewBudgetButton />} />
      ) : (
        <>
          {totalBudget > 0 ? <p className="mt-3 text-xs text-muted">Category budgets this month total {m(totalBudget)}.</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.sort((a, b) => Number(!!a.b.expense_category_id) - Number(!!b.b.expense_category_id) || b.usage.utilizationPct - a.usage.utilizationPct).map((r) => (
              <BudgetCard key={r.b.id} budget={r.b} usage={r.usage} periodLabel={r.label} categoryName={catName(r.b.expense_category_id)} />
            ))}
          </div>
          {monthly.length ? (
            <Card className="mt-6">
              <CardHeader><div><CardTitle>Month-by-month comparison</CardTitle><CardDescription>Spent vs budget for the last 6 months</CardDescription></div></CardHeader>
              <CardContent>
                <Table>
                  <THead><tr><TH>Budget</TH>{months.map((k) => <TH key={k} className="text-right">{monthLabel(k)}</TH>)}</tr></THead>
                  <tbody>
                    {monthly.map((b) => (
                      <TR key={b.id}>
                        <TD className="font-medium">{b.name}<span className="block text-[11px] text-muted">{m(b.amount_minor)}/mo</span></TD>
                        {months.map((k) => {
                          const r = periodRange("month", `${k}-01`);
                          if (!budgetAppliesTo(b, r.from, r.to)) return <TD key={k} className="text-right text-muted">—</TD>;
                          const u = computeBudgetUsage(b.amount_minor, spentForBudget(b, txs, r.from, r.to, cats.childrenOf), b.thresholds);
                          return (
                            <TD key={k} className="text-right tabular">
                              <span className={cn(u.level === "exceeded" ? "text-danger" : u.utilizationPct >= 90 ? "text-warning" : "")}>{m(u.spentMinor)}</span>
                              <span className="block text-[11px] text-muted">{u.utilizationPct}%</span>
                            </TD>
                          );
                        })}
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
