export interface AchievementStats {
  expenseCount: number;
  incomeCount: number;
  goalCount: number;
  completedGoalCount: number;
  totalSavedMinor: number;
  /** minor units per major unit for the user's currency (100 for INR). */
  minorFactor: number;
  streakDays: number;
  monthsWithinBudget: number;
  bestMonthlySavingsRatePct: number;
  emergencyFundMonths: number;
  debtCount: number;
  outstandingDebtMinor: number;
  investmentCount: number;
}

/** Returns the achievement codes the user has earned based on actual data. */
export function earnedAchievements(s: AchievementStats): string[] {
  const codes: string[] = [];
  if (s.expenseCount > 0) codes.push("first_expense");
  if (s.incomeCount > 0) codes.push("first_income");
  if (s.goalCount > 0) codes.push("first_goal");
  if (s.totalSavedMinor >= 1_000 * s.minorFactor) codes.push("saved_1000");
  if (s.totalSavedMinor >= 100_000 * s.minorFactor) codes.push("saved_1_lakh");
  if (s.completedGoalCount > 0) codes.push("goal_completed");
  if (s.streakDays >= 7) codes.push("streak_7");
  if (s.streakDays >= 30) codes.push("streak_30");
  if (s.monthsWithinBudget > 0) codes.push("within_budget");
  if (s.bestMonthlySavingsRatePct >= 10) codes.push("savings_rate_10");
  if (s.bestMonthlySavingsRatePct >= 20) codes.push("savings_rate_20");
  if (s.emergencyFundMonths >= 3) codes.push("emergency_fund");
  if (s.debtCount > 0 && s.outstandingDebtMinor === 0) codes.push("debt_free");
  if (s.investmentCount > 0) codes.push("first_investment");
  return codes;
}

/** Progress (0-100) toward each achievement for the "next milestones" view. */
export function achievementProgress(s: AchievementStats): Record<string, number> {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    first_expense: s.expenseCount > 0 ? 100 : 0,
    first_income: s.incomeCount > 0 ? 100 : 0,
    first_goal: s.goalCount > 0 ? 100 : 0,
    saved_1000: clamp((s.totalSavedMinor / (1_000 * s.minorFactor)) * 100),
    saved_1_lakh: clamp((s.totalSavedMinor / (100_000 * s.minorFactor)) * 100),
    goal_completed: s.completedGoalCount > 0 ? 100 : 0,
    streak_7: clamp((s.streakDays / 7) * 100),
    streak_30: clamp((s.streakDays / 30) * 100),
    within_budget: s.monthsWithinBudget > 0 ? 100 : 0,
    savings_rate_10: clamp((s.bestMonthlySavingsRatePct / 10) * 100),
    savings_rate_20: clamp((s.bestMonthlySavingsRatePct / 20) * 100),
    emergency_fund: clamp((s.emergencyFundMonths / 3) * 100),
    debt_free: s.debtCount > 0 && s.outstandingDebtMinor === 0 ? 100 : 0,
    first_investment: s.investmentCount > 0 ? 100 : 0,
  };
}
