import { describe, expect, it } from "vitest";
import { averageMonthlyContribution, computeGoalPlan, deriveGoalStatus, estimateCompletionDate, planGoals, scenarioMonthlyRequired } from "@/lib/finance/goals";

describe("goal plan", () => {
  it("matches the MacBook example (₹1,80,000, ₹20,000 saved, 12 months)", () => {
    const p = computeGoalPlan({ targetMinor: 18_000_000, savedMinor: 2_000_000, today: "2026-11-05", targetDate: "2027-11-05" });
    expect(p.remainingMinor).toBe(16_000_000);
    expect(p.monthsLeft).toBe(12);
    expect(p.monthlyRequiredMinor).toBe(1_333_334); // ₹13,333.34 rounded up
    expect(p.daysLeft).toBe(365);
    expect(p.dailyRequiredMinor).toBe(43_836); // 1,60,000 / 365 = 438.356 → ₹438.36
    expect(p.weeklyRequiredMinor).toBe(Math.ceil(16_000_000 / (365 / 7)));
    expect(p.progressPct).toBe(11.11);
  });

  it("reports progress like the spec example (₹60,000 of ₹1,80,000 = 33.33%)", () => {
    expect(computeGoalPlan({ targetMinor: 18_000_000, savedMinor: 6_000_000, today: "2026-01-01", targetDate: "2026-12-31" }).progressPct).toBe(33.33);
  });

  it("handles past deadlines by requiring the full remainder now", () => {
    const p = computeGoalPlan({ targetMinor: 10_000, savedMinor: 4_000, today: "2026-06-01", targetDate: "2026-05-01" });
    expect(p.isOverdue).toBe(true);
    expect(p.monthlyRequiredMinor).toBe(6_000);
    expect(p.dailyRequiredMinor).toBe(6_000);
  });

  it("handles completed and over-funded goals", () => {
    const p = computeGoalPlan({ targetMinor: 10_000, savedMinor: 15_000, today: "2026-06-01", targetDate: "2027-05-01" });
    expect(p.remainingMinor).toBe(0);
    expect(p.progressPct).toBe(100);
    expect(p.monthlyRequiredMinor).toBe(0);
  });

  it("handles leap years in day counts", () => {
    const p = computeGoalPlan({ targetMinor: 36_600, savedMinor: 0, today: "2028-01-01", targetDate: "2029-01-01" });
    expect(p.daysLeft).toBe(366);
    expect(p.dailyRequiredMinor).toBe(100);
    expect(p.monthsLeft).toBe(12);
  });

  it("recalculates when the deadline moves", () => {
    const input = { targetMinor: 12_000_00, savedMinor: 0, today: "2026-01-01", targetDate: "2027-01-01" };
    expect(scenarioMonthlyRequired(input, 0).monthlyRequiredMinor).toBe(100_000);
    expect(scenarioMonthlyRequired(input, 12).monthlyRequiredMinor).toBe(50_000);
    expect(scenarioMonthlyRequired(input, -6).monthlyRequiredMinor).toBe(200_000);
  });
});

describe("goal pace & status", () => {
  it("averages contributions over the trailing window", () => {
    const avg = averageMonthlyContribution(
      [
        { amountMinor: 10_000, date: "2026-03-01" },
        { amountMinor: 10_000, date: "2026-04-01" },
        { amountMinor: 10_000, date: "2026-05-01" },
      ],
      "2026-05-30",
    );
    expect(avg).toBeGreaterThan(9_000);
    expect(avg).toBeLessThan(11_000);
  });

  it("estimates completion dates", () => {
    expect(estimateCompletionDate(0, 100, "2026-01-01")).toBe("2026-01-01");
    expect(estimateCompletionDate(1000, 0, "2026-01-01")).toBeNull();
    expect(estimateCompletionDate(1000, 100, "2026-01-01")).toBe("2026-11-01");
  });

  it("derives status from pace", () => {
    const base = { storedStatus: "active" as const, targetMinor: 100_000, savedMinor: 50_000, today: "2026-06-01", targetDate: "2026-12-01", hasContributions: true, createdOn: "2026-01-01" };
    expect(deriveGoalStatus({ ...base, monthlyPaceMinor: 10_000 })).toBe("on_track");
    expect(deriveGoalStatus({ ...base, monthlyPaceMinor: 1_000 })).toBe("at_risk");
    expect(deriveGoalStatus({ ...base, savedMinor: 100_000, monthlyPaceMinor: 0 })).toBe("completed");
    expect(deriveGoalStatus({ ...base, storedStatus: "paused", monthlyPaceMinor: 0 })).toBe("paused");
    expect(deriveGoalStatus({ ...base, savedMinor: 0, hasContributions: false, monthlyPaceMinor: 0 })).toBe("not_started");
  });
});

describe("multi-goal planner", () => {
  it("allocates capacity by priority then deadline without double counting", () => {
    const res = planGoals(
      [
        { id: "a", name: "Trip", priority: "low", targetDate: "2027-01-01", remainingMinor: 60_000, monthlyRequiredMinor: 10_000 },
        { id: "b", name: "Laptop", priority: "high", targetDate: "2027-06-01", remainingMinor: 120_000, monthlyRequiredMinor: 15_000 },
        { id: "c", name: "Bike", priority: "high", targetDate: "2026-12-01", remainingMinor: 50_000, monthlyRequiredMinor: 8_000 },
      ],
      25_000,
      "2026-06-01",
    );
    expect(res.goals.map((g) => g.id)).toEqual(["c", "b", "a"]);
    expect(res.goals.reduce((s, g) => s + g.allocatedMonthlyMinor, 0)).toBe(25_000);
    expect(res.goals[0].fullyFunded).toBe(true);
    expect(res.goals[1].fullyFunded).toBe(true);
    expect(res.goals[2].allocatedMonthlyMinor).toBe(2_000);
    expect(res.goals[2].delayMonths).toBeGreaterThan(0);
    expect(res.shortfallMinor).toBe(8_000);
    expect(res.affordable).toBe(false);
  });

  it("treats zero or negative capacity as unaffordable", () => {
    const res = planGoals([{ id: "a", name: "X", priority: "medium", targetDate: "2027-01-01", remainingMinor: 1000, monthlyRequiredMinor: 100 }], -500, "2026-01-01");
    expect(res.goals[0].allocatedMonthlyMinor).toBe(0);
    expect(res.goals[0].projectedDate).toBeNull();
  });
});
