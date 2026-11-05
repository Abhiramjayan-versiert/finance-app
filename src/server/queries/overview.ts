import "server-only";
import { cache } from "react";
import type { Workspace } from "@/lib/auth";
import { addDaysISO, daysInRange, lastMonths, monthLabel, periodRange, previousRange, formatDisplayDate } from "@/lib/finance/dates";
import { averageMonthlySurplus, monthlySeries, rollupCategoryId, spendingSummary, totals } from "@/lib/finance/analytics";
import { budgetAppliesTo, computeBudgetUsage, spentForBudget } from "@/lib/finance/budgets";
import { generateInsights } from "@/lib/finance/insights";
import { portfolioTotals } from "@/lib/finance/investments";
import { getBudgets, getCategories, getNetWorth, getRecurring, getTransactions } from "./finance";

/** Everything the Overview needs, computed from the user's actual records. */
export const getOverview = cache(async (ws: Workspace) => {
  const today = ws.today;
  const month = periodRange("month", today);
  const prevMonth = previousRange(month, "month");
  const since = `${lastMonths(12, today)[0]}-01`;
  const [txs, cats, budgets, nw, recurring] = await Promise.all([
    getTransactions({ from: since, to: addDaysISO(today, 366) }),
    getCategories(),
    getBudgets(),
    getNetWorth(today, ws.settings.net_worth_cash_source),
    getRecurring(),
  ]);
  const actualTxs = txs.filter((t) => t.occurred_on <= today || t.status === "expected");
  const thisMonth = totals(actualTxs, month);
  const lastMonth = totals(actualTxs, prevMonth);
  const spendThis = spendingSummary(actualTxs, month, cats.expense);
  const spendLast = spendingSummary(actualTxs, prevMonth, cats.expense);
  const series = monthlySeries(actualTxs, 12, today);

  const budgetRows = budgets
    .filter((b) => b.period === "monthly" && budgetAppliesTo(b, month.from, month.to))
    .map((b) => {
      const spent = spentForBudget(b, actualTxs, month.from, month.to, cats.childrenOf);
      return { budget: b, usage: computeBudgetUsage(b.amount_minor, spent, b.thresholds), categoryName: b.expense_category_id ? cats.expense.find((c) => c.id === b.expense_category_id)?.name ?? "Category" : "Overall" };
    });
  const overall = budgetRows.find((r) => !r.budget.expense_category_id);

  const portfolio = portfolioTotals(nw.investments.map((i) => ({ asset_type: i.asset_type, investedMinor: i.investedMinor, currentValueMinor: i.current_value_minor })));
  const totalSavingsMinor = nw.savings.totalMinor + nw.goalAllocationsMinor;
  const outstandingDebtMinor = nw.debts.reduce((s, d) => s + d.outstandingMinor, 0);

  const recurringMonthly = recurring
    .filter((r) => r.type === "expense" && r.is_active)
    .reduce((s, r) => {
      const perMonth = { daily: 30.44, weekly: 4.345, monthly: 1, yearly: 1 / 12 }[r.frequency] / Math.max(1, r.interval_count);
      return s + Math.round(r.amount_minor * perMonth);
    }, 0);

  const surplus = averageMonthlySurplus(actualTxs, today, 3);
  const emergencyBucket = nw.savings.accounts.filter((a) => a.kind === "emergency").reduce((s, a) => s + a.balanceMinor, 0);
  const emergencyGoal = nw.goals.filter((g) => g.category === "emergency_fund" && !g.savings_account_id).reduce((s, g) => s + g.savedMinor, 0);
  const emergencyMonths = surplus.expenseMinor > 0 ? (emergencyBucket + emergencyGoal) / surplus.expenseMinor : null;

  const insights = generateInsights({
    currency: ws.settings.currency,
    locale: ws.settings.locale,
    monthLabel: monthLabel(today.slice(0, 7)),
    thisMonth,
    lastMonth,
    categoriesThisMonth: spendThis.byCategory,
    categoriesLastMonth: spendLast.byCategory,
    monthProgress: Math.min(1, (Number(today.slice(8, 10)) || 1) / daysInRange(month)),
    overallBudget: overall ? { amountMinor: overall.usage.budgetMinor, spentMinor: overall.usage.spentMinor } : null,
    budgetsOver: budgetRows.filter((r) => r.budget.expense_category_id && r.usage.utilizationPct >= 90).map((r) => ({ name: r.categoryName, utilizationPct: r.usage.utilizationPct })),
    recurringExpenseMonthlyMinor: recurringMonthly,
    goals: nw.goals
      .filter((g) => g.status !== "cancelled" && g.status !== "paused")
      .map((g) => ({ name: g.name, status: g.derivedStatus, etaLabel: g.etaDate && g.plan.remainingMinor > 0 ? `by ${formatDisplayDate(g.etaDate, "MMM yyyy")}` : null })),
    emergencyFundMonths: emergencyMonths !== null && (emergencyBucket + emergencyGoal > 0 || nw.savings.accounts.some((a) => a.kind === "emergency")) ? emergencyMonths : null,
  });

  return {
    today,
    month,
    thisMonth,
    lastMonth,
    spendThis,
    spendLast,
    series,
    budgetRows,
    overall,
    nw,
    portfolio,
    totalSavingsMinor,
    outstandingDebtMinor,
    insights,
    surplus,
    recentTransactions: actualTxs.filter((t) => t.occurred_on <= today).slice(0, 8),
    catNameById: new Map([...cats.expense, ...cats.income].map((c) => [c.id, c.name])),
    rollup: (id: string | null) => rollupCategoryId(id, new Map(cats.expense.map((c) => [c.id, c]))),
  };
});
