import { describe, expect, it } from "vitest";
import { safeToSpend, upcomingItems } from "@/lib/finance/upcoming";
import { guessMapping, mapStatement, parseCsv, parseDate } from "@/lib/import/statement";

describe("upcoming bills", () => {
  it("lists recurring occurrences and EMIs in the window, sorted", () => {
    const items = upcomingItems(
      [
        { id: "rent", type: "expense", title: "Rent", amount_minor: 2_500_000, frequency: "monthly", interval_count: 1, start_date: "2026-01-01", end_date: null, is_active: true },
        { id: "gym", type: "expense", title: "Gym", amount_minor: 150_000, frequency: "weekly", interval_count: 1, start_date: "2026-11-02", end_date: null, is_active: false },
        { id: "sal", type: "income", title: "Salary", amount_minor: 8_500_000, frequency: "monthly", interval_count: 1, start_date: "2026-01-30", end_date: null, is_active: true },
      ],
      [{ id: "car", name: "Car loan", emi_minor: 1_200_000, nextDue: "2026-11-10", outstandingMinor: 30_000_000, payment_frequency: "monthly" }],
      "2026-11-05",
      30,
    );
    expect(items.map((i) => `${i.date} ${i.title}`)).toEqual(["2026-11-10 Car loan EMI", "2026-11-30 Salary", "2026-12-01 Rent"]);
  });
  it("skips paid-off debts", () => {
    expect(upcomingItems([], [{ id: "x", name: "X", emi_minor: 100, nextDue: "2026-11-10", outstandingMinor: 0, payment_frequency: "monthly" }], "2026-11-05")).toEqual([]);
  });
});

describe("safe to spend", () => {
  it("subtracts bills and planned savings, spreads over remaining days", () => {
    const r = safeToSpend({ today: "2026-11-21", monthEnd: "2026-11-30", cashMinor: 3_000_000, upcomingOutflowsMinor: 1_000_000, plannedSavingsMinor: 500_000 });
    expect(r).toEqual({ totalMinor: 1_500_000, perDayMinor: 150_000, daysLeft: 10, shortfallMinor: 0 });
  });
  it("reports a shortfall instead of a negative daily amount", () => {
    const r = safeToSpend({ today: "2026-11-30", monthEnd: "2026-11-30", cashMinor: 100, upcomingOutflowsMinor: 500, plannedSavingsMinor: 0 });
    expect(r.perDayMinor).toBe(0);
    expect(r.shortfallMinor).toBe(400);
  });
});

describe("statement import", () => {
  it("parses quoted CSV with BOM and CRLF", () => {
    expect(parseCsv('﻿Date,Narration,Amount\r\n05/11/2026,"Swiggy, Bangalore",-450.50\r\n')).toEqual([["Date", "Narration", "Amount"], ["05/11/2026", "Swiggy, Bangalore", "-450.50"]]);
  });
  it("reads common Indian bank date formats", () => {
    expect(parseDate("05/11/2026", "dd/mm/yyyy")).toBe("2026-11-05");
    expect(parseDate("05-Nov-2026", "dd/mm/yyyy")).toBe("2026-11-05");
    expect(parseDate("5 Nov 26", "dd/mm/yyyy")).toBe("2026-11-05");
    expect(parseDate("2026-11-05", "yyyy-mm-dd")).toBe("2026-11-05");
    expect(parseDate("31/02/2026", "dd/mm/yyyy")).toBeNull();
  });
  it("maps signed amounts and debit/credit columns", () => {
    const a = mapStatement(parseCsv("Date,Desc,Amount\n01/11/2026,Salary,\"85,000.00\"\n02/11/2026,Rent,-25000\n03/11/2026,Bad,abc\nxx,Oops,10"), { date: 0, description: 1, amount: 2, dateFormat: "dd/mm/yyyy" }, "INR", true);
    expect(a.rows).toEqual([
      { line: 2, date: "2026-11-01", title: "Salary", type: "income", amountMinor: 8_500_000 },
      { line: 3, date: "2026-11-02", title: "Rent", type: "expense", amountMinor: 2_500_000 },
    ]);
    expect(a.errors.map((e) => e.line)).toEqual([4, 5]);
    const b = mapStatement(parseCsv("Txn Date,Narration,Withdrawal Amt,Deposit Amt\n01/11/2026,ATM,2000.00,\n02/11/2026,Refund,,150.75"), { date: 0, description: 1, debit: 2, credit: 3, dateFormat: "dd/mm/yyyy" }, "INR", true);
    expect(b.rows.map((r) => [r.type, r.amountMinor])).toEqual([["expense", 200_000], ["income", 15_075]]);
  });
  it("guesses columns from headers", () => {
    expect(guessMapping(["Txn Date", "Narration", "Withdrawal Amt", "Deposit Amt", "Balance"])).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
    expect(guessMapping(["Date", "Description", "Amount"])).toMatchObject({ date: 0, description: 1, amount: 2 });
  });
});
