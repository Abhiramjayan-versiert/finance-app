import { addDays, addMonths, addWeeks, addYears, getDate, getDaysInMonth, setDate } from "date-fns";
import { parseDate, toISODate, type ISODate } from "./dates";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: Frequency;
  interval: number; // every N units (custom schedules)
  startDate: ISODate;
  endDate?: ISODate | null;
}

/**
 * n-th occurrence of a rule. Month/year steps are computed from the start
 * date (not chained) so a rule starting on the 31st lands on the last day of
 * shorter months and returns to the 31st afterwards; Feb 29 yearly rules fall
 * on Feb 28 in non-leap years.
 */
export function nthOccurrence(rule: RecurrenceRule, n: number): ISODate {
  const start = parseDate(rule.startDate);
  const step = n * Math.max(1, rule.interval);
  switch (rule.frequency) {
    case "daily":
      return toISODate(addDays(start, step));
    case "weekly":
      return toISODate(addWeeks(start, step));
    case "monthly": {
      const target = addMonths(setDate(start, 1), step);
      const day = Math.min(getDate(start), getDaysInMonth(target));
      return toISODate(setDate(target, day));
    }
    case "yearly":
      return toISODate(addYears(start, step));
  }
}

/** All occurrences within [from, to] (inclusive), capped for safety. */
export function occurrencesBetween(rule: RecurrenceRule, from: ISODate, to: ISODate, cap = 1000): ISODate[] {
  const out: ISODate[] = [];
  const end = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (end < rule.startDate) return out;
  // Skip ahead quickly for daily/weekly rules.
  let n = 0;
  if (from > rule.startDate && (rule.frequency === "daily" || rule.frequency === "weekly")) {
    const days = Math.floor((parseDate(from).getTime() - parseDate(rule.startDate).getTime()) / 86_400_000);
    const unit = (rule.frequency === "daily" ? 1 : 7) * Math.max(1, rule.interval);
    n = Math.max(0, Math.floor(days / unit) - 1);
  }
  for (let i = 0; i < 100_000 && out.length < cap; i++, n++) {
    const d = nthOccurrence(rule, n);
    if (d > end) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Occurrences that should exist up to `today` but have not been generated yet. */
export function dueOccurrences(rule: RecurrenceRule, lastGenerated: ISODate | null, today: ISODate, cap = 366): ISODate[] {
  const from = lastGenerated ? toISODate(addDays(parseDate(lastGenerated), 1)) : rule.startDate;
  return occurrencesBetween(rule, from, today, cap);
}

export function nextOccurrence(rule: RecurrenceRule, after: ISODate): ISODate | null {
  const next = occurrencesBetween(rule, toISODate(addDays(parseDate(after), 1)), "9999-12-31", 1);
  return next[0] ?? null;
}

export function describeRule(rule: Pick<RecurrenceRule, "frequency" | "interval">): string {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[rule.frequency];
  if (rule.interval <= 1) return { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[rule.frequency];
  return `Every ${rule.interval} ${unit}s`;
}
