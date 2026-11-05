import Decimal from "decimal.js";
import { addDaysISO, daysBetween, type ISODate } from "./dates";
import { occurrencesBetween, type Frequency } from "./recurrence";

export interface UpcomingItem {
  key: string;
  date: ISODate;
  title: string;
  amountMinor: number;
  kind: "recurring_expense" | "recurring_income" | "emi";
  link: string;
}

interface RuleLike {
  id: string;
  type: "income" | "expense";
  title: string;
  amount_minor: number;
  frequency: Frequency;
  interval_count: number;
  start_date: ISODate;
  end_date: ISODate | null;
  is_active: boolean;
}

interface DebtLike {
  id: string;
  name: string;
  emi_minor: number | null;
  nextDue: ISODate | null;
  outstandingMinor: number;
  payment_frequency: "weekly" | "monthly" | "quarterly" | "yearly";
}

const STEP_DAYS = { weekly: 7, monthly: 0, quarterly: 0, yearly: 0 } as const;

/** Scheduled money movements in (today, today + days], from recurring rules and EMIs. */
export function upcomingItems(rules: RuleLike[], debts: DebtLike[], today: ISODate, days = 30): UpcomingItem[] {
  const until = addDaysISO(today, days);
  const out: UpcomingItem[] = [];
  for (const r of rules) {
    if (!r.is_active) continue;
    for (const d of occurrencesBetween({ frequency: r.frequency, interval: r.interval_count, startDate: r.start_date, endDate: r.end_date }, addDaysISO(today, 1), until, 50)) {
      out.push({ key: `r:${r.id}:${d}`, date: d, title: r.title, amountMinor: r.amount_minor, kind: r.type === "income" ? "recurring_income" : "recurring_expense", link: "/transactions?view=recurring" });
    }
  }
  for (const d of debts) {
    if (!d.emi_minor || !d.nextDue || d.outstandingMinor <= 0) continue;
    let due = d.nextDue;
    for (let i = 0; i < 10 && due <= until; i++) {
      if (due >= today) out.push({ key: `e:${d.id}:${due}`, date: due, title: `${d.name} EMI`, amountMinor: Math.min(d.emi_minor, d.outstandingMinor + d.emi_minor), kind: "emi", link: "/debts" });
      if (d.payment_frequency === "weekly") due = addDaysISO(due, STEP_DAYS.weekly);
      else {
        const months = d.payment_frequency === "monthly" ? 1 : d.payment_frequency === "quarterly" ? 3 : 12;
        const dt = new Date(`${due}T00:00:00Z`);
        dt.setUTCMonth(dt.getUTCMonth() + months);
        due = dt.toISOString().slice(0, 10);
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export interface SafeToSpendInput {
  today: ISODate;
  monthEnd: ISODate;
  cashMinor: number;
  /** Bills/EMIs still due on or before month end. */
  upcomingOutflowsMinor: number;
  /** Goal savings still planned for this month. */
  plannedSavingsMinor: number;
}

/**
 * What can still be spent this month without touching bills or goal savings,
 * and the same per remaining day (including today). Never negative per day.
 */
export function safeToSpend(i: SafeToSpendInput) {
  const daysLeft = Math.max(1, daysBetween(i.today, i.monthEnd) + 1);
  const totalMinor = i.cashMinor - i.upcomingOutflowsMinor - i.plannedSavingsMinor;
  const perDayMinor = totalMinor > 0 ? new Decimal(totalMinor).div(daysLeft).floor().toNumber() : 0;
  return { totalMinor, perDayMinor, daysLeft, shortfallMinor: totalMinor < 0 ? -totalMinor : 0 };
}
