import Decimal from "decimal.js";
import { addMonthsISO, addDaysISO, daysBetween, fractionalMonthsBetween, type ISODate } from "./dates";
import { divideMinor, percent } from "./money";

export type StoredGoalStatus = "not_started" | "active" | "paused" | "cancelled" | "completed";
export type GoalStatus = StoredGoalStatus | "on_track" | "at_risk";
export type Priority = "low" | "medium" | "high";

export interface GoalPlanInput {
  targetMinor: number;
  savedMinor: number;
  today: ISODate;
  targetDate: ISODate;
}

export interface GoalPlan {
  remainingMinor: number;
  progressPct: number;
  daysLeft: number;
  weeksLeft: number;
  monthsLeft: number;
  isOverdue: boolean;
  /** Required savings to hit the target date (rounded up to the minor unit). */
  dailyRequiredMinor: number;
  weeklyRequiredMinor: number;
  monthlyRequiredMinor: number;
}

/**
 * Remaining = target − saved.  Required per period = remaining / periods left.
 * When the deadline is today or past, the full remaining amount is "required now".
 */
export function computeGoalPlan({ targetMinor, savedMinor, today, targetDate }: GoalPlanInput): GoalPlan {
  const remainingMinor = Math.max(0, targetMinor - Math.max(0, savedMinor));
  const progressPct = Math.min(100, percent(Math.max(0, savedMinor), targetMinor));
  const daysLeft = Math.max(0, daysBetween(today, targetDate));
  const monthsLeft = fractionalMonthsBetween(today, targetDate);
  const weeksLeft = daysLeft / 7;
  const isOverdue = daysLeft === 0 && remainingMinor > 0;

  const per = (periods: number) => (remainingMinor === 0 ? 0 : periods <= 0 ? remainingMinor : divideMinor(remainingMinor, new Decimal(periods), "ceil"));

  return {
    remainingMinor,
    progressPct,
    daysLeft,
    weeksLeft: new Decimal(weeksLeft).toDecimalPlaces(2).toNumber(),
    monthsLeft: new Decimal(monthsLeft).toDecimalPlaces(2).toNumber(),
    isOverdue,
    dailyRequiredMinor: per(daysLeft),
    weeklyRequiredMinor: per(weeksLeft),
    monthlyRequiredMinor: per(monthsLeft),
  };
}

export interface ContributionPoint {
  amountMinor: number;
  date: ISODate;
}

/**
 * Average monthly contribution over the trailing window (default 90 days),
 * measured from the earlier of the first contribution and the window start.
 */
export function averageMonthlyContribution(contributions: ContributionPoint[], today: ISODate, windowDays = 90): number {
  const windowStart = addDaysISO(today, -windowDays);
  const inWindow = contributions.filter((c) => c.date > windowStart && c.date <= today);
  if (inWindow.length === 0) return 0;
  const total = inWindow.reduce((s, c) => s + c.amountMinor, 0);
  if (total <= 0) return 0;
  const first = inWindow.reduce((m, c) => (c.date < m ? c.date : m), inWindow[0].date);
  const spanDays = Math.max(30, daysBetween(first, today) + 1);
  return divideMinor(total, new Decimal(spanDays).div(new Decimal(365).div(12)), "floor");
}

/** Projected completion date at a given monthly pace, or null if no pace. */
export function estimateCompletionDate(remainingMinor: number, monthlyPaceMinor: number, today: ISODate): ISODate | null {
  if (remainingMinor <= 0) return today;
  if (monthlyPaceMinor <= 0) return null;
  const months = new Decimal(remainingMinor).div(monthlyPaceMinor);
  if (months.gt(1200)) return null;
  const whole = months.floor().toNumber();
  const days = months.minus(whole).mul(30.44).ceil().toNumber();
  return addDaysISO(addMonthsISO(today, whole), days);
}

export interface GoalStatusInput {
  storedStatus: StoredGoalStatus;
  targetMinor: number;
  savedMinor: number;
  today: ISODate;
  targetDate: ISODate;
  monthlyPaceMinor: number;
  hasContributions: boolean;
  createdOn: ISODate;
}

export function deriveGoalStatus(i: GoalStatusInput): GoalStatus {
  if (i.storedStatus === "paused" || i.storedStatus === "cancelled") return i.storedStatus;
  if (i.savedMinor >= i.targetMinor) return "completed";
  if (!i.hasContributions && i.savedMinor <= 0) return daysBetween(i.today, i.targetDate) <= 0 ? "at_risk" : "not_started";
  if (daysBetween(i.today, i.targetDate) <= 0) return "at_risk";
  const eta = estimateCompletionDate(i.targetMinor - i.savedMinor, i.monthlyPaceMinor, i.today);
  // Not enough history to judge yet.
  if (daysBetween(i.createdOn, i.today) < 30 && !eta) return "active";
  if (!eta) return "at_risk";
  return eta <= i.targetDate ? "on_track" : "at_risk";
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: "Not started",
  active: "Active",
  on_track: "On track",
  at_risk: "At risk",
  completed: "Completed",
  paused: "Paused",
  cancelled: "Cancelled",
};

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

/** Monthly amount required if the deadline moves by `deltaMonths` (+ later, − earlier). */
export function scenarioMonthlyRequired(input: GoalPlanInput, deltaMonths: number): { targetDate: ISODate; monthlyRequiredMinor: number; possible: boolean } {
  const targetDate = addMonthsISO(input.targetDate, deltaMonths);
  const possible = targetDate > input.today;
  const plan = computeGoalPlan({ ...input, targetDate });
  return { targetDate, monthlyRequiredMinor: plan.monthlyRequiredMinor, possible };
}

// ---------------------------------------------------------------------------
// Multi-goal planner
// ---------------------------------------------------------------------------

export interface PlannerGoal {
  id: string;
  name: string;
  priority: Priority;
  targetDate: ISODate;
  remainingMinor: number;
  monthlyRequiredMinor: number;
}

export interface PlannerResult {
  monthlyCapacityMinor: number;
  totalRequiredMinor: number;
  shortfallMinor: number;
  affordable: boolean;
  goals: Array<
    PlannerGoal & {
      allocatedMonthlyMinor: number;
      fullyFunded: boolean;
      projectedDate: ISODate | null;
      delayMonths: number;
      rank: number;
    }
  >;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/**
 * Allocates a monthly savings capacity (e.g. average income − expenses) across
 * goals in priority order, then earliest deadline. Each goal keeps its own
 * allocation, so money is never counted towards two goals.
 */
export function planGoals(goals: PlannerGoal[], monthlyCapacityMinor: number, today: ISODate): PlannerResult {
  const ordered = [...goals]
    .filter((g) => g.remainingMinor > 0)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.targetDate.localeCompare(b.targetDate));
  let left = Math.max(0, monthlyCapacityMinor);
  const totalRequiredMinor = ordered.reduce((s, g) => s + g.monthlyRequiredMinor, 0);
  const out = ordered.map((g, idx) => {
    const allocated = Math.min(left, g.monthlyRequiredMinor);
    left -= allocated;
    const fullyFunded = allocated >= g.monthlyRequiredMinor;
    const projectedDate = fullyFunded ? g.targetDate : estimateCompletionDate(g.remainingMinor, allocated, today);
    const delayMonths = projectedDate && !fullyFunded ? Math.max(0, Math.ceil(fractionalMonthsBetween(g.targetDate, projectedDate))) : 0;
    return { ...g, allocatedMonthlyMinor: allocated, fullyFunded, projectedDate, delayMonths, rank: idx + 1 };
  });
  const shortfallMinor = Math.max(0, totalRequiredMinor - Math.max(0, monthlyCapacityMinor));
  return { monthlyCapacityMinor, totalRequiredMinor, shortfallMinor, affordable: shortfallMinor === 0, goals: out };
}
