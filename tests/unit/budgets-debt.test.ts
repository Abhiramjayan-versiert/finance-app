import { describe, expect, it } from "vitest";
import { computeBudgetUsage, spentForBudget } from "@/lib/finance/budgets";
import { amortize, calculateEmi, compareRepayment, repaymentProgress, splitPayment } from "@/lib/finance/debt";

describe("budgets", () => {
  it("computes utilisation and warning levels", () => {
    expect(computeBudgetUsage(600_000, 0).level).toBe("ok");
    expect(computeBudgetUsage(600_000, 300_000).crossedThreshold).toBe(50);
    expect(computeBudgetUsage(600_000, 300_000).level).toBe("notice");
    expect(computeBudgetUsage(600_000, 450_000).level).toBe("notice");
    expect(computeBudgetUsage(600_000, 540_000).level).toBe("warning");
    expect(computeBudgetUsage(600_000, 600_000).level).toBe("critical");
    expect(computeBudgetUsage(600_000, 700_000).level).toBe("exceeded");
    const u = computeBudgetUsage(3_000_000, 1_250_000);
    expect(u.remainingMinor).toBe(1_750_000);
    expect(u.utilizationPct).toBe(41.7);
  });

  it("supports custom thresholds", () => {
    expect(computeBudgetUsage(1000, 600, [60, 80]).crossedThreshold).toBe(60);
    expect(computeBudgetUsage(1000, 600, [60, 80]).level).toBe("warning");
  });

  it("includes subcategories and respects date ranges", () => {
    const children = new Map([["food", ["dining"]]]);
    const budget = { id: "b", period: "monthly" as const, expense_category_id: "food", amount_minor: 1000, start_date: "2026-01-01", end_date: null };
    const spent = spentForBudget(budget, [
      { amount_minor: 100, expense_category_id: "food", occurred_on: "2026-03-02" },
      { amount_minor: 200, expense_category_id: "dining", occurred_on: "2026-03-10" },
      { amount_minor: 400, expense_category_id: "travel", occurred_on: "2026-03-10" },
      { amount_minor: 800, expense_category_id: "food", occurred_on: "2026-02-28" },
    ], "2026-03-01", "2026-03-31", children);
    expect(spent).toBe(300);
  });
});

describe("EMI & debt", () => {
  it("computes the standard EMI (₹10L @ 10% for 20y ≈ ₹9,650.22)", () => {
    expect(calculateEmi(100_000_000, 10, 240)).toBe(965_022);
  });

  it("handles zero-interest and zero-tenure loans", () => {
    expect(calculateEmi(120_000, 0, 12)).toBe(10_000);
    expect(calculateEmi(120_000, 10, 0)).toBe(0);
  });

  it("amortises to zero with total interest consistent", () => {
    const emi = calculateEmi(50_000_000, 9, 60);
    const res = amortize({ balanceMinor: 50_000_000, annualRatePct: 9, paymentMinor: emi, startDate: "2026-01-05" });
    expect(res.periods).toBe(60);
    expect(res.schedule.at(-1)!.balanceMinor).toBe(0);
    expect(res.totalPaidMinor - res.totalInterestMinor).toBe(50_000_000);
    expect(res.payoffDate).toBe("2030-12-05");
  });

  it("detects payments that never pay off the loan", () => {
    expect(amortize({ balanceMinor: 1_000_000, annualRatePct: 24, paymentMinor: 10_000 }).neverPaysOff).toBe(true);
  });

  it("compares prepayment scenarios", () => {
    const emi = calculateEmi(10_000_000, 12, 36);
    const c = compareRepayment({ balanceMinor: 10_000_000, annualRatePct: 12, paymentMinor: emi, extraPaymentMinor: 100_000 });
    expect(c.periodsSaved).toBeGreaterThan(0);
    expect(c.interestSavedMinor).toBeGreaterThan(0);
  });

  it("splits payments into interest and principal", () => {
    const s = splitPayment(1_000_000, 10_000_000, 12);
    expect(s.interestMinor).toBe(100_000);
    expect(s.principalMinor).toBe(900_000);
    const tiny = splitPayment(500, 300, 12);
    expect(tiny.principalMinor).toBe(300);
    expect(tiny.interestMinor + tiny.principalMinor).toBe(500);
    expect(repaymentProgress(1000, 250)).toBe(75);
  });
});
