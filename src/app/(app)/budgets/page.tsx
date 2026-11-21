import type { Metadata } from "next";
import { Gauge } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getBudgets, getCategories, getTransactions } from "@/server/queries/finance";
import { budgetAppliesTo, computeBudgetUsage, spentForBudget } from "@/lib/finance/budgets";
import { addMonthsISO, lastMonths, monthLabel, periodRange, daysBetween } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { Expandable } from "@/components/shared/expandable";
import { PageHeader } from "@/components/shared/page-header";
import { HELP } from "@/components/shared/page-help";
import { EmptyState } from "@/components/shared/states";
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
      const daysLeft = ws.today >= range.from && ws.today <= range.to ? daysBetween(ws.today, range.to) + 1 : null;
      return { b, usage: computeBudgetUsage(b.amount_minor, spentForBudget(b, txs, range.from, range.to, cats.childrenOf), b.thresholds), label: b.period === "monthly" ? monthLabel(anchor.slice(0, 7)) : anchor.slice(0, 4), daysLeft };
    })
    .filter(Boolean) as Array<{ b: (typeof budgets)[number]; usage: ReturnType<typeof computeBudgetUsage>; label: string; daysLeft: number | null }>;
  const monthly = budgets.filter((b) => b.period === "monthly");
  const totalBudget = rows.filter((r) => r.b.period === "monthly" && r.b.expense_category_id).reduce((s, r) => s + r.usage.budgetMinor, 0);

  return (
    <>
      <PageHeader help={HELP.budgets} title="Budgets" description="Spending limits that warn you before you overspend." actions={<NewBudgetButton />} />
      <PeriodNav period="month" label={monthLabel(anchor.slice(0, 7))} prevDate={addMonthsISO(anchor, -1)} nextDate={addMonthsISO(anchor, 1)} from={month.from} to={month.to} showTabs={false} />
      {budgets.length === 0 ? (
        <EmptyState className="mt-4" icon={Gauge} title="No budgets yet" description="Example: overall ₹30,000/month with Food ₹6,000, Transport ₹3,000, Shopping ₹5,000 and Entertainment ₹2,000." action={<NewBudgetButton />} />
      ) : (
        <>
          {totalBudget > 0 ? <p className="mt-3 text-sm text-muted">Your category limits add up to {m(totalBudget)} this month.</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.sort((a, b) => Number(!!a.b.expense_category_id) - Number(!!b.b.expense_category_id) || b.usage.utilizationPct - a.usage.utilizationPct).map((r) => (
              <BudgetCard key={r.b.id} budget={r.b} usage={r.usage} periodLabel={r.label} categoryName={catName(r.b.expense_category_id)} daysLeft={r.daysLeft} />
            ))}
          </div>
          {monthly.length ? (
            <Expandable className="mt-6" title="Past months" description="How much you spent against each limit, last 6 months">
              <div className="overflow-x-auto">
                <Table>
                  <THead><tr><TH>Budget</TH>{months.map((k) => <TH key={k} className="text-right">{monthLabel(k)}</TH>)}</tr></THead>
                  <tbody>
                    {monthly.map((b) => (
                      <TR key={b.id}>
                        <TD className="font-medium">{b.name}<span className="block text-xs text-muted">{m(b.amount_minor)}/mo</span></TD>
                        {months.map((k) => {
                          const r = periodRange("month", `${k}-01`);
                          if (!budgetAppliesTo(b, r.from, r.to)) return <TD key={k} className="text-right text-muted">—</TD>;
                          const u = computeBudgetUsage(b.amount_minor, spentForBudget(b, txs, r.from, r.to, cats.childrenOf), b.thresholds);
                          return (
                            <TD key={k} className="text-right tabular">
                              <span className={cn(u.level === "exceeded" ? "text-danger" : u.utilizationPct >= 90 ? "text-warning" : "")}>{m(u.spentMinor)}</span>
                              <span className="block text-xs text-muted">{u.utilizationPct}%</span>
                            </TD>
                          );
                        })}
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Expandable>
          ) : null}
        </>
      )}
    </>
  );
}
