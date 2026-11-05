import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDaysInMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";

/** ISO calendar date string (YYYY-MM-DD). All financial dates are calendar dates. */
export type ISODate = string;

export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

export function parseDate(s: ISODate): Date {
  return parseISO(s);
}

/** "Today" in the user's time zone, as a calendar date. */
export function todayInTimeZone(timeZone = "Asia/Kolkata", now: Date = new Date()): ISODate {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return toISODate(now);
  }
}

export type PeriodKind = "day" | "week" | "month" | "year" | "custom";

export interface DateRange {
  from: ISODate;
  to: ISODate; // inclusive
}

export function periodRange(kind: Exclude<PeriodKind, "custom">, anchor: ISODate): DateRange {
  const d = parseDate(anchor);
  switch (kind) {
    case "day":
      return { from: anchor, to: anchor };
    case "week":
      return { from: toISODate(startOfWeek(d, { weekStartsOn: 1 })), to: toISODate(endOfWeek(d, { weekStartsOn: 1 })) };
    case "month":
      return { from: toISODate(startOfMonth(d)), to: toISODate(endOfMonth(d)) };
    case "year":
      return { from: toISODate(startOfYear(d)), to: toISODate(endOfYear(d)) };
  }
}

/** The equally long period immediately before `range`. */
export function previousRange(range: DateRange, kind: PeriodKind = "custom"): DateRange {
  const from = parseDate(range.from);
  if (kind === "month") {
    const p = subMonths(from, 1);
    return { from: toISODate(startOfMonth(p)), to: toISODate(endOfMonth(p)) };
  }
  if (kind === "year") {
    const p = subYears(from, 1);
    return { from: toISODate(startOfYear(p)), to: toISODate(endOfYear(p)) };
  }
  const len = daysInRange(range);
  return { from: toISODate(subDays(from, len)), to: toISODate(subDays(from, 1)) };
}

export function daysInRange(range: DateRange): number {
  return differenceInCalendarDays(parseDate(range.to), parseDate(range.from)) + 1;
}

export function eachDay(range: DateRange): ISODate[] {
  const out: ISODate[] = [];
  const n = daysInRange(range);
  const start = parseDate(range.from);
  for (let i = 0; i < n && i < 3700; i++) out.push(toISODate(addDays(start, i)));
  return out;
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

/** Last `n` month keys ending at `anchor`'s month (oldest first). */
export function lastMonths(n: number, anchor: ISODate): string[] {
  const d = startOfMonth(parseDate(anchor));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(format(subMonths(d, i), "yyyy-MM"));
  return out;
}

export function monthLabel(key: string): string {
  return format(parseISO(`${key}-01`), "MMM yy");
}

/** Financial-year range containing `anchor`, for a FY starting in `startMonth` (1-12). */
export function financialYearRange(anchor: ISODate, startMonth = 4): DateRange {
  const d = parseDate(anchor);
  const year = d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
  const from = new Date(year, startMonth - 1, 1);
  const to = subDays(addMonths(from, 12), 1);
  return { from: toISODate(from), to: toISODate(to) };
}

/**
 * Months between two calendar dates, including the fractional part of the
 * final partial month. 2026-01-15 → 2027-01-15 = 12; → 2026-02-29 ≈ 1.5.
 */
export function fractionalMonthsBetween(from: ISODate, to: ISODate): number {
  const a = parseDate(from);
  const b = parseDate(to);
  if (b <= a) return 0;
  let whole = differenceInCalendarMonths(b, a);
  let anchor = addMonths(a, whole);
  if (anchor > b) {
    whole -= 1;
    anchor = addMonths(a, whole);
  }
  const rest = differenceInCalendarDays(b, anchor);
  return whole + rest / getDaysInMonth(anchor);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseDate(to), parseDate(from));
}

export function addMonthsISO(date: ISODate, months: number): ISODate {
  return toISODate(addMonths(parseDate(date), months));
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  return toISODate(addDays(parseDate(date), days));
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function formatDisplayDate(date: ISODate, pattern = "dd MMM yyyy"): string {
  try {
    return format(parseDate(date), pattern);
  } catch {
    return date;
  }
}
