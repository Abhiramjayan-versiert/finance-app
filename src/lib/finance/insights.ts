import { changePct } from "./analytics";
import { formatMoney } from "./money";

export type InsightTone = "positive" | "neutral" | "warning" | "negative";

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  link?: string;
}

export interface InsightInputs {
  currency: string;
  locale: string;
  monthLabel: string;
  thisMonth: { incomeMinor: number; expenseMinor: number };
  lastMonth: { incomeMinor: number; expenseMinor: number };
  /** Spending by top-level category, this month and the previous month. */
  categoriesThisMonth: Array<{ id: string | null; name: string; amountMinor: number }>;
  categoriesLastMonth: Array<{ id: string | null; name: string; amountMinor: number }>;
  /** Fraction of the month elapsed (0-1], used to fairly compare partial months. */
  monthProgress: number;
  overallBudget?: { amountMinor: number; spentMinor: number } | null;
  budgetsOver: Array<{ name: string; utilizationPct: number }>;
  recurringExpenseMonthlyMinor: number;
  goals: Array<{ name: string; etaLabel: string | null; status: string }>;
  emergencyFundMonths: number | null;
}

/**
 * Deterministic, rule-based insights derived only from the user's records.
 * Every statement is backed by a number shown in the detail. No insight is
 * produced when there is not enough data to support it.
 */
export function generateInsights(i: InsightInputs): Insight[] {
  const out: Insight[] = [];
  const m = (v: number) => formatMoney(v, i.currency, { locale: i.locale });

  if (i.thisMonth.expenseMinor > 0 && i.lastMonth.expenseMinor > 0) {
    const ch = changePct(i.thisMonth.expenseMinor, i.lastMonth.expenseMinor);
    if (ch !== null && Math.abs(ch) >= 5) {
      const up = ch > 0;
      out.push({
        id: "spending-change",
        tone: up ? (i.monthProgress < 1 ? "warning" : "negative") : "positive",
        title: `Your spending ${up ? "increased" : "decreased"} by ${Math.abs(ch)}% ${i.monthProgress < 1 ? "so far this month" : "this month"}`,
        detail: `${m(i.thisMonth.expenseMinor)} in ${i.monthLabel} vs ${m(i.lastMonth.expenseMinor)} last month.`,
        link: "/expenses",
      });
    }
  }

  const top = i.categoriesThisMonth[0];
  if (top && top.amountMinor > 0 && i.thisMonth.expenseMinor > 0) {
    out.push({
      id: "top-category",
      tone: "neutral",
      title: `${top.name} is your highest expense category`,
      detail: `${m(top.amountMinor)} (${Math.round((top.amountMinor / i.thisMonth.expenseMinor) * 100)}% of spending) in ${i.monthLabel}.`,
      link: "/expenses",
    });
  }

  // Largest category increase vs last month.
  const last = new Map(i.categoriesLastMonth.map((c) => [c.id, c.amountMinor]));
  let biggest: { name: string; delta: number } | null = null;
  for (const c of i.categoriesThisMonth) {
    const prev = last.get(c.id) ?? 0;
    const delta = c.amountMinor - prev;
    if (prev > 0 && delta > 0 && (!biggest || delta > biggest.delta)) biggest = { name: c.name, delta };
  }
  if (biggest && biggest.delta > 0) {
    out.push({
      id: "category-increase",
      tone: "warning",
      title: `You spent ${m(biggest.delta)} more on ${biggest.name.toLowerCase()} than last month`,
      detail: "Compare categories in Reports to see what changed.",
      link: "/reports",
    });
  }

  if (i.thisMonth.incomeMinor > 0) {
    const rate = Math.round(((i.thisMonth.incomeMinor - i.thisMonth.expenseMinor) / i.thisMonth.incomeMinor) * 1000) / 10;
    out.push({
      id: "savings-rate",
      tone: rate >= 20 ? "positive" : rate >= 0 ? "neutral" : "negative",
      title: `Your current savings rate is ${rate}%`,
      detail: `Income ${m(i.thisMonth.incomeMinor)} − expenses ${m(i.thisMonth.expenseMinor)} in ${i.monthLabel}.${rate < 10 ? " Aiming for at least 10–20% builds resilience." : ""}`,
    });
  }

  if (i.overallBudget && i.overallBudget.spentMinor > i.overallBudget.amountMinor) {
    out.push({
      id: "over-budget",
      tone: "negative",
      title: "Your monthly expenses are exceeding your budget",
      detail: `${m(i.overallBudget.spentMinor)} spent against a ${m(i.overallBudget.amountMinor)} budget.`,
      link: "/budgets",
    });
  } else {
    for (const b of i.budgetsOver.slice(0, 2)) {
      out.push({ id: `budget-${b.name}`, tone: b.utilizationPct >= 100 ? "negative" : "warning", title: `${b.name} budget is at ${Math.round(b.utilizationPct)}%`, detail: "Review recent transactions in this category.", link: "/budgets" });
    }
  }

  if (i.recurringExpenseMonthlyMinor > 0 && i.thisMonth.expenseMinor > 0) {
    const share = Math.round((i.recurringExpenseMonthlyMinor / Math.max(i.thisMonth.expenseMinor, i.recurringExpenseMonthlyMinor)) * 100);
    if (share >= 25) {
      out.push({ id: "recurring", tone: "neutral", title: "You could save more by reducing recurring expenses", detail: `Recurring expenses total about ${m(i.recurringExpenseMonthlyMinor)} per month (${share}% of this month's spending).`, link: "/transactions?view=recurring" });
    }
  }

  for (const g of i.goals.filter((g) => g.etaLabel && g.status !== "completed").slice(0, 2)) {
    out.push({ id: `goal-${g.name}`, tone: g.status === "at_risk" ? "warning" : "positive", title: `At your current pace you are likely to reach ${g.name} ${g.etaLabel}`, detail: "Based on your average contributions over the last 90 days. This is an estimate, not a guarantee.", link: "/goals" });
  }

  if (i.emergencyFundMonths !== null && i.emergencyFundMonths < 3) {
    out.push({ id: "emergency-fund", tone: "warning", title: `Your emergency fund covers ${i.emergencyFundMonths.toFixed(1)} months of expenses`, detail: "A common guideline is 3–6 months of essential expenses.", link: "/savings" });
  }

  return out;
}
