import { describe, expect, it } from "vitest";
import { dueOccurrences, nextOccurrence, nthOccurrence, occurrencesBetween } from "@/lib/finance/recurrence";
import { averageMonthlySurplus, monthlySeries, spendingSummary, totals, trackingStreak } from "@/lib/finance/analytics";
import { financialYearRange, fractionalMonthsBetween, previousRange, todayInTimeZone } from "@/lib/finance/dates";
import { earnedAchievements } from "@/lib/finance/achievements";
import { generateInsights } from "@/lib/finance/insights";

describe("recurrence", () => {
  it("clamps month-end dates and recovers afterwards", () => {
    const rule = { frequency: "monthly" as const, interval: 1, startDate: "2026-01-31" };
    expect([0, 1, 2, 3].map((n) => nthOccurrence(rule, n))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("handles leap-day yearly rules", () => {
    const rule = { frequency: "yearly" as const, interval: 1, startDate: "2028-02-29" };
    expect(nthOccurrence(rule, 1)).toBe("2029-02-28");
    expect(nthOccurrence(rule, 4)).toBe("2032-02-29");
  });
  it("supports custom intervals and end dates", () => {
    const rule = { frequency: "weekly" as const, interval: 2, startDate: "2026-01-01", endDate: "2026-02-15" };
    expect(occurrencesBetween(rule, "2026-01-01", "2026-12-31")).toEqual(["2026-01-01", "2026-01-15", "2026-01-29", "2026-02-12"]);
  });
  it("generates only missing occurrences (idempotent catch-up)", () => {
    const rule = { frequency: "daily" as const, interval: 1, startDate: "2026-03-01" };
    expect(dueOccurrences(rule, null, "2026-03-03")).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
    expect(dueOccurrences(rule, "2026-03-03", "2026-03-03")).toEqual([]);
    expect(dueOccurrences(rule, "2026-03-02", "2026-03-04")).toEqual(["2026-03-03", "2026-03-04"]);
    expect(nextOccurrence(rule, "2026-03-04")).toBe("2026-03-05");
  });
  it("skips ahead efficiently for long-running daily rules", () => {
    const rule = { frequency: "daily" as const, interval: 1, startDate: "2000-01-01" };
    expect(occurrencesBetween(rule, "2026-01-01", "2026-01-02")).toEqual(["2026-01-01", "2026-01-02"]);
  });
});

describe("dates", () => {
  it("computes fractional months and FY ranges", () => {
    expect(fractionalMonthsBetween("2026-01-15", "2027-01-15")).toBe(12);
    expect(fractionalMonthsBetween("2026-01-31", "2026-02-28")).toBe(1);
    expect(fractionalMonthsBetween("2026-05-01", "2026-04-01")).toBe(0);
    expect(financialYearRange("2026-02-10", 4)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(financialYearRange("2026-04-01", 4)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(previousRange({ from: "2026-03-01", to: "2026-03-31" }, "month")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousRange({ from: "2026-03-10", to: "2026-03-16" })).toEqual({ from: "2026-03-03", to: "2026-03-09" });
  });
  it("resolves today in the user's time zone", () => {
    const instant = new Date("2026-03-31T20:00:00Z");
    expect(todayInTimeZone("Asia/Kolkata", instant)).toBe("2026-04-01");
    expect(todayInTimeZone("America/New_York", instant)).toBe("2026-03-31");
  });
});

describe("analytics", () => {
  const txs = [
    { type: "income" as const, amount_minor: 100_000, occurred_on: "2026-03-01" },
    { type: "income" as const, status: "expected" as const, amount_minor: 50_000, occurred_on: "2026-03-20" },
    { type: "expense" as const, amount_minor: 20_000, occurred_on: "2026-03-02", expense_category_id: "food" },
    { type: "expense" as const, amount_minor: 5_000, occurred_on: "2026-03-02", expense_category_id: "dining" },
    { type: "expense" as const, amount_minor: 10_000, occurred_on: "2026-03-05", expense_category_id: "rent" },
    { type: "expense" as const, amount_minor: 7_000, occurred_on: "2026-02-05", expense_category_id: "rent" },
  ];
  const cats = [
    { id: "food", name: "Food", color: "#fff" },
    { id: "dining", name: "Dining", color: "#fff", parent_id: "food" },
    { id: "rent", name: "Rent", color: "#fff" },
  ];
  it("never counts expected income as received", () => {
    const t = totals(txs, { from: "2026-03-01", to: "2026-03-31" });
    expect(t.incomeMinor).toBe(100_000);
    expect(t.expectedIncomeMinor).toBe(50_000);
    expect(t.expenseMinor).toBe(35_000);
    expect(t.savingsRatePct).toBe(65);
  });
  it("summarises spending with subcategory roll-up", () => {
    const s = spendingSummary(txs, { from: "2026-03-01", to: "2026-03-31" }, cats);
    expect(s.totalMinor).toBe(35_000);
    expect(s.count).toBe(3);
    expect(s.highestDay).toEqual({ date: "2026-03-02", amountMinor: 25_000 });
    expect(s.topCategory?.name).toBe("Food");
    expect(s.byCategory[0].amountMinor).toBe(25_000);
    expect(s.averageDailyMinor).toBe(1129);
    expect(s.byDay).toHaveLength(31);
  });
  it("builds monthly series and surplus", () => {
    const series = monthlySeries(txs, 2, "2026-03-15");
    expect(series).toEqual([
      { month: "2026-02", incomeMinor: 0, expenseMinor: 7_000, netMinor: -7_000 },
      { month: "2026-03", incomeMinor: 100_000, expenseMinor: 35_000, netMinor: 65_000 },
    ]);
    expect(averageMonthlySurplus(txs, "2026-04-10", 3).surplusMinor).toBe(Math.round((100_000 - 42_000) / 2));
  });
  it("computes tracking streaks", () => {
    expect(trackingStreak(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-03")).toBe(3);
    expect(trackingStreak(["2026-03-01", "2026-03-02"], "2026-03-03")).toBe(2);
    expect(trackingStreak(["2026-03-01"], "2026-03-03")).toBe(0);
    expect(trackingStreak(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01")).toBe(3);
  });
});

describe("achievements & insights", () => {
  it("awards only what the data supports", () => {
    const codes = earnedAchievements({ expenseCount: 1, incomeCount: 0, goalCount: 0, completedGoalCount: 0, totalSavedMinor: 100_000, minorFactor: 100, streakDays: 7, monthsWithinBudget: 0, bestMonthlySavingsRatePct: 12, emergencyFundMonths: 0, debtCount: 0, outstandingDebtMinor: 0, investmentCount: 0 });
    expect(codes.sort()).toEqual(["first_expense", "saved_1000", "savings_rate_10", "streak_7"].sort());
  });
  it("produces no insights without data", () => {
    const out = generateInsights({ currency: "INR", locale: "en-IN", monthLabel: "Mar", thisMonth: { incomeMinor: 0, expenseMinor: 0 }, lastMonth: { incomeMinor: 0, expenseMinor: 0 }, categoriesThisMonth: [], categoriesLastMonth: [], monthProgress: 1, budgetsOver: [], recurringExpenseMonthlyMinor: 0, goals: [], emergencyFundMonths: null });
    expect(out).toEqual([]);
  });
  it("describes spending changes from real numbers", () => {
    const out = generateInsights({ currency: "INR", locale: "en-IN", monthLabel: "Mar", thisMonth: { incomeMinor: 10_000_000, expenseMinor: 2_300_000 }, lastMonth: { incomeMinor: 0, expenseMinor: 2_000_000 }, categoriesThisMonth: [{ id: "s", name: "Shopping", amountMinor: 1_000_000 }], categoriesLastMonth: [{ id: "s", name: "Shopping", amountMinor: 750_000 }], monthProgress: 1, budgetsOver: [], recurringExpenseMonthlyMinor: 0, goals: [], emergencyFundMonths: null });
    expect(out.find((i) => i.id === "spending-change")?.title).toBe("Your spending increased by 15% this month");
    expect(out.find((i) => i.id === "category-increase")?.title).toBe("You spent ₹2,500 more on shopping than last month");
    expect(out.find((i) => i.id === "savings-rate")?.title).toBe("Your current savings rate is 77%");
  });
});
