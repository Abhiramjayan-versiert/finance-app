import { describe, expect, it } from "vitest";
import { portfolioTotals, sipFutureValue, summarizeHolding } from "@/lib/finance/investments";
import * as C from "@/lib/finance/calculators";
import { computeNetWorth } from "@/lib/finance/networth";

describe("investments", () => {
  it("tracks average cost basis through partial sells", () => {
    const s = summarizeHolding([
      { type: "buy", amount_minor: 100_000, units: 10, occurred_on: "2026-01-01" },
      { type: "buy", amount_minor: 200_000, units: 10, occurred_on: "2026-02-01" },
      { type: "sell", amount_minor: 200_000, units: 10, occurred_on: "2026-03-01" },
      { type: "valuation", amount_minor: 210_000, units: null, occurred_on: "2026-03-02" },
    ], 210_000);
    expect(s.investedMinor).toBe(150_000);
    expect(s.realizedGainMinor).toBe(50_000);
    expect(s.units).toBe(10);
  });

  it("computes portfolio returns and allocation", () => {
    const p = portfolioTotals([
      { asset_type: "stock", investedMinor: 100_000, currentValueMinor: 120_000 },
      { asset_type: "gold", investedMinor: 100_000, currentValueMinor: 80_000 },
    ]);
    expect(p.unrealizedPnlMinor).toBe(0);
    expect(p.returnPct).toBe(0);
    expect(p.allocation[0].pct).toBe(60);
  });

  it("computes SIP future value (₹5,000/m @12% for 10y ≈ ₹11.6L)", () => {
    const r = sipFutureValue(500_000, 12, 120);
    expect(r.investedMinor).toBe(60_000_000);
    expect(r.futureValueMinor / 100).toBeCloseTo(1_161_695.38, 0);
  });
});

describe("calculators", () => {
  it("compound interest", () => {
    const r = C.compoundInterest(100_000, 10, 1, 1);
    expect(r.futureValue).toBe(110_000);
    expect(C.compoundInterest(100_000, 12, 1, 12).futureValue).toBeCloseTo(112_682.5, 1);
    expect(C.compoundInterest(1000, 0, 5, 12, 100).futureValue).toBe(7000);
  });
  it("simple interest", () => {
    expect(C.simpleInterest(50_000, 8, 3)).toEqual({ interest: 12_000, totalAmount: 62_000 });
  });
  it("SIP", () => {
    expect(C.sipCalculator(5000, 12, 10).futureValue).toBeCloseTo(1_161_695.38, 1);
    expect(C.sipCalculator(5000, 0, 1).futureValue).toBe(60_000);
  });
  it("EMI", () => {
    expect(C.emiCalculator(1_000_000, 10, 240).emi).toBe(9650.22);
  });
  it("loan repayment with extra payments", () => {
    const r = C.loanRepaymentCalculator(500_000, 10, 10_624.0, 2_000);
    expect(r.months).toBe(60);
    expect(r.monthsSaved).toBeGreaterThan(0);
  });
  it("savings goal", () => {
    const r = C.savingsGoalCalculator(180_000, 20_000, 12);
    expect(r.remaining).toBe(160_000);
    expect(r.monthlyRequired).toBeCloseTo(13_333.33, 2);
  });
  it("retirement", () => {
    const r = C.retirementCalculator({ currentAge: 30, retirementAge: 60, lifeExpectancy: 85, monthlyExpensesToday: 50_000, inflationPct: 6, preRetirementReturnPct: 12, postRetirementReturnPct: 8, currentSavings: 500_000 });
    expect(r.monthlyExpenseAtRetirement).toBeCloseTo(287_174.56, 0);
    expect(r.corpusRequired).toBeGreaterThan(r.monthlyExpenseAtRetirement * 12 * 15);
    expect(r.monthlyInvestmentRequired).toBeGreaterThan(0);
  });
  it("inflation", () => {
    expect(C.inflationCalculator(100_000, 6, 10).futureCost).toBeCloseTo(179_084.77, 1);
  });
  it("monthly budget", () => {
    expect(C.monthlyBudgetCalculator(100_000)).toMatchObject({ needs: 50_000, wants: 30_000, savings: 20_000, valid: true });
    expect(C.monthlyBudgetCalculator(100_000, 60, 30, 20).valid).toBe(false);
  });
  it("investment return / CAGR", () => {
    const r = C.investmentReturnCalculator(100_000, 200_000, 6);
    expect(r.absoluteReturnPct).toBe(100);
    expect(r.cagrPct).toBeCloseTo(12.25, 1);
    expect(C.investmentReturnCalculator(0, 100, 1).cagrPct).toBe(0);
  });
  it("emergency fund", () => {
    expect(C.emergencyFundCalculator(30_000, 6, 60_000, 10_000)).toEqual({ target: 180_000, gap: 120_000, coveragePct: 33.33, monthsToGoal: 12 });
  });
  it("financial independence", () => {
    const r = C.financialIndependenceCalculator({ annualExpenses: 600_000, withdrawalRatePct: 4, currentInvestments: 0, monthlyInvestment: 50_000, expectedReturnPct: 10 });
    expect(r.fiNumber).toBe(15_000_000);
    expect(r.reachable).toBe(true);
    expect(r.yearsToFI).toBeGreaterThan(10);
    expect(C.financialIndependenceCalculator({ annualExpenses: 1, withdrawalRatePct: 4, currentInvestments: 0, monthlyInvestment: 0, expectedReturnPct: 0 }).reachable).toBe(false);
  });
});

describe("net worth", () => {
  it("counts each pool once and ignores manual cash when cash is tracked", () => {
    const r = computeNetWorth({
      cashSource: "tracked",
      trackedCashMinor: 50_000,
      savingsBucketsMinor: 100_000,
      goalAllocationsMinor: 20_000,
      investmentsMinor: 300_000,
      manualAssets: [{ type: "bank_account", value_minor: 999_999 }, { type: "property", value_minor: 1_000_000 }],
      debtsOutstandingMinor: 400_000,
      manualLiabilities: [{ type: "credit_card", amount_minor: 10_000 }],
    });
    expect(r.totalAssetsMinor).toBe(1_470_000);
    expect(r.totalLiabilitiesMinor).toBe(410_000);
    expect(r.netWorthMinor).toBe(1_060_000);
  });
  it("uses manual cash when selected and records negative tracked cash as a liability", () => {
    expect(computeNetWorth({ cashSource: "manual", trackedCashMinor: 5, savingsBucketsMinor: 0, goalAllocationsMinor: 0, investmentsMinor: 0, manualAssets: [{ type: "bank_account", value_minor: 100 }], debtsOutstandingMinor: 0, manualLiabilities: [] }).netWorthMinor).toBe(100);
    expect(computeNetWorth({ cashSource: "tracked", trackedCashMinor: -100, savingsBucketsMinor: 0, goalAllocationsMinor: 0, investmentsMinor: 0, manualAssets: [], debtsOutstandingMinor: 0, manualLiabilities: [] }).netWorthMinor).toBe(-100);
  });
});
