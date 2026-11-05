import Decimal from "decimal.js";
import { daysInRange, eachDay, lastMonths, monthKey, type DateRange, type ISODate } from "./dates";
import { percent } from "./money";

export interface TxLike {
  type: "income" | "expense";
  status?: "completed" | "expected";
  amount_minor: number;
  occurred_on: ISODate;
  expense_category_id?: string | null;
  income_category_id?: string | null;
}

export interface CategoryMeta {
  id: string;
  name: string;
  color: string;
  parent_id?: string | null;
}

const actual = (t: TxLike) => t.status !== "expected";

export function totals(txs: TxLike[], range?: DateRange) {
  let income = 0;
  let expense = 0;
  let expected = 0;
  for (const t of txs) {
    if (range && (t.occurred_on < range.from || t.occurred_on > range.to)) continue;
    if (t.type === "income") {
      if (actual(t)) income += t.amount_minor;
      else expected += t.amount_minor;
    } else expense += t.amount_minor;
  }
  return { incomeMinor: income, expenseMinor: expense, expectedIncomeMinor: expected, netMinor: income - expense, savingsRatePct: income > 0 ? percent(income - expense, income, 1) : 0 };
}

export interface SpendingSummary {
  totalMinor: number;
  count: number;
  averageDailyMinor: number;
  highestDay: { date: ISODate; amountMinor: number } | null;
  topCategory: { id: string | null; name: string; amountMinor: number } | null;
  byDay: Array<{ date: ISODate; amountMinor: number }>;
  byCategory: Array<{ id: string | null; name: string; color: string; amountMinor: number; pct: number }>;
}

/** Rolls subcategories up into their parent category for breakdowns. */
export function rollupCategoryId(id: string | null | undefined, cats: Map<string, CategoryMeta>): string | null {
  if (!id) return null;
  const c = cats.get(id);
  if (!c) return null;
  return c.parent_id ?? c.id;
}

export function spendingSummary(txs: TxLike[], range: DateRange, categories: CategoryMeta[]): SpendingSummary {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const expenses = txs.filter((t) => t.type === "expense" && t.occurred_on >= range.from && t.occurred_on <= range.to);
  const dayMap = new Map<ISODate, number>();
  const catMap = new Map<string | null, number>();
  let total = 0;
  for (const e of expenses) {
    total += e.amount_minor;
    dayMap.set(e.occurred_on, (dayMap.get(e.occurred_on) ?? 0) + e.amount_minor);
    const cid = rollupCategoryId(e.expense_category_id, cats);
    catMap.set(cid, (catMap.get(cid) ?? 0) + e.amount_minor);
  }
  const days = daysInRange(range);
  const byDay = days <= 400 ? eachDay(range).map((date) => ({ date, amountMinor: dayMap.get(date) ?? 0 })) : [];
  let highestDay: SpendingSummary["highestDay"] = null;
  for (const [date, amountMinor] of dayMap) if (!highestDay || amountMinor > highestDay.amountMinor) highestDay = { date, amountMinor };
  const byCategory = [...catMap.entries()]
    .map(([id, amountMinor]) => ({
      id,
      name: id ? cats.get(id)?.name ?? "Uncategorised" : "Uncategorised",
      color: id ? cats.get(id)?.color ?? "#A0A6AD" : "#A0A6AD",
      amountMinor,
      pct: percent(amountMinor, total, 1),
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
  return {
    totalMinor: total,
    count: expenses.length,
    averageDailyMinor: new Decimal(total).div(Math.max(1, days)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    highestDay,
    topCategory: byCategory[0] ? { id: byCategory[0].id, name: byCategory[0].name, amountMinor: byCategory[0].amountMinor } : null,
    byDay,
    byCategory,
  };
}

export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return percent(current - previous, previous, 1);
}

export function monthlySeries(txs: TxLike[], months: number, anchor: ISODate) {
  const keys = lastMonths(months, anchor);
  const map = new Map(keys.map((k) => [k, { month: k, incomeMinor: 0, expenseMinor: 0 }]));
  for (const t of txs) {
    const row = map.get(monthKey(t.occurred_on));
    if (!row) continue;
    if (t.type === "income" && actual(t)) row.incomeMinor += t.amount_minor;
    else if (t.type === "expense") row.expenseMinor += t.amount_minor;
  }
  return keys.map((k) => {
    const r = map.get(k)!;
    return { ...r, netMinor: r.incomeMinor - r.expenseMinor };
  });
}

export function incomeBySource(txs: TxLike[], range: DateRange, categories: CategoryMeta[]) {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const map = new Map<string | null, number>();
  let total = 0;
  for (const t of txs) {
    if (t.type !== "income" || !actual(t) || t.occurred_on < range.from || t.occurred_on > range.to) continue;
    const id = t.income_category_id ?? null;
    map.set(id, (map.get(id) ?? 0) + t.amount_minor);
    total += t.amount_minor;
  }
  return [...map.entries()]
    .map(([id, amountMinor]) => ({ id, name: id ? cats.get(id)?.name ?? "Other" : "Uncategorised", color: id ? cats.get(id)?.color ?? "#39C982" : "#A0A6AD", amountMinor, pct: percent(amountMinor, total, 1) }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

/** Consecutive days (ending today or yesterday) with at least one recorded activity. */
export function trackingStreak(activityDates: Iterable<ISODate>, today: ISODate): number {
  const set = new Set(activityDates);
  const day = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const start = set.has(today) ? 0 : set.has(day(1)) ? 1 : -1;
  if (start < 0) return 0;
  let streak = 0;
  while (set.has(day(start + streak))) streak++;
  return streak;
}

/** Average monthly net (income − expenses) over the last `n` complete months. */
export function averageMonthlySurplus(txs: TxLike[], today: ISODate, n = 3): { incomeMinor: number; expenseMinor: number; surplusMinor: number } {
  const keys = lastMonths(n + 1, today).slice(0, n); // exclude the current partial month
  const series = monthlySeries(txs, n + 1, today).filter((r) => keys.includes(r.month));
  const withData = series.filter((r) => r.incomeMinor > 0 || r.expenseMinor > 0);
  const base = withData.length ? withData : series;
  const div = Math.max(1, base.length);
  const inc = Math.round(base.reduce((s, r) => s + r.incomeMinor, 0) / div);
  const exp = Math.round(base.reduce((s, r) => s + r.expenseMinor, 0) / div);
  return { incomeMinor: inc, expenseMinor: exp, surplusMinor: inc - exp };
}
