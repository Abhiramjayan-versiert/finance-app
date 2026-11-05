import { percent } from "./money";

export const DEFAULT_THRESHOLDS = [50, 75, 90, 100];

export type BudgetLevel = "ok" | "notice" | "warning" | "critical" | "exceeded";

export interface BudgetUsage {
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  utilizationPct: number;
  /** Highest configured threshold that has been reached, or null. */
  crossedThreshold: number | null;
  level: BudgetLevel;
}

export function computeBudgetUsage(budgetMinor: number, spentMinor: number, thresholds: number[] = DEFAULT_THRESHOLDS): BudgetUsage {
  const utilizationPct = percent(spentMinor, budgetMinor, 1);
  const sorted = [...new Set(thresholds)].sort((a, b) => a - b);
  const crossed = sorted.filter((t) => utilizationPct >= t);
  const crossedThreshold = crossed.length ? crossed[crossed.length - 1] : null;
  let level: BudgetLevel = "ok";
  if (spentMinor > budgetMinor) level = "exceeded";
  else if (crossedThreshold !== null) {
    const idx = sorted.indexOf(crossedThreshold);
    const fromTop = sorted.length - 1 - idx;
    level = fromTop === 0 ? "critical" : fromTop === 1 ? "warning" : "notice";
  }
  return {
    budgetMinor,
    spentMinor,
    remainingMinor: budgetMinor - spentMinor,
    utilizationPct,
    crossedThreshold,
    level,
  };
}

export interface BudgetLike {
  id: string;
  period: "monthly" | "yearly";
  expense_category_id: string | null;
  amount_minor: number;
  start_date: string;
  end_date: string | null;
}

/** Whether a budget applies to the period beginning `periodStart`. */
export function budgetAppliesTo(b: BudgetLike, periodStart: string, periodEnd: string): boolean {
  return b.start_date <= periodEnd && (!b.end_date || b.end_date >= periodStart);
}

export interface ExpenseLike {
  amount_minor: number;
  expense_category_id: string | null;
  occurred_on: string;
}

/**
 * Spending attributable to a budget. Category budgets include the category's
 * subcategories (`childrenOf` maps parent -> child ids).
 */
export function spentForBudget(b: BudgetLike, expenses: ExpenseLike[], from: string, to: string, childrenOf: Map<string, string[]>): number {
  const ids = b.expense_category_id ? new Set([b.expense_category_id, ...(childrenOf.get(b.expense_category_id) ?? [])]) : null;
  let total = 0;
  for (const e of expenses) {
    if (e.occurred_on < from || e.occurred_on > to) continue;
    if (ids && (!e.expense_category_id || !ids.has(e.expense_category_id))) continue;
    total += e.amount_minor;
  }
  return total;
}

export function levelColor(level: BudgetLevel): "success" | "accent" | "warning" | "danger" {
  switch (level) {
    case "ok":
      return "success";
    case "notice":
      return "accent";
    case "warning":
      return "warning";
    default:
      return "danger";
  }
}
