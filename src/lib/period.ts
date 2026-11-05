import { addDaysISO, addMonthsISO, formatDisplayDate, periodRange, type DateRange } from "@/lib/finance/dates";

export type Period = "day" | "week" | "month" | "year" | "custom";

export function resolvePeriod(sp: { period?: string; date?: string; from?: string; to?: string }, today: string) {
  const period: Period = (["day", "week", "month", "year", "custom"] as const).includes(sp.period as Period) ? (sp.period as Period) : "month";
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const anchor = valid(sp.date) ?? today;
  let range: DateRange;
  if (period === "custom") {
    const from = valid(sp.from) ?? periodRange("month", today).from;
    const to = valid(sp.to) ?? today;
    range = from <= to ? { from, to } : { from: to, to: from };
  } else range = periodRange(period, anchor);
  const step = (dir: 1 | -1) =>
    period === "day" ? addDaysISO(anchor, dir) : period === "week" ? addDaysISO(anchor, 7 * dir) : period === "month" ? addMonthsISO(anchor, dir) : addMonthsISO(anchor, 12 * dir);
  const label =
    period === "day" ? formatDisplayDate(anchor, "EEE, dd MMM yyyy") : period === "week" ? `${formatDisplayDate(range.from, "dd MMM")} – ${formatDisplayDate(range.to, "dd MMM yyyy")}` : period === "month" ? formatDisplayDate(anchor, "MMMM yyyy") : period === "year" ? anchor.slice(0, 4) : `${formatDisplayDate(range.from)} – ${formatDisplayDate(range.to)}`;
  return { period, anchor, range, label, prevDate: step(-1), nextDate: step(1) };
}
