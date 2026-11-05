import { describe, expect, it } from "vitest";
import { divideMinor, formatMoney, formatMoneyPlain, fromMinor, MoneyError, percent, sumMinor, toMinor } from "@/lib/finance/money";

describe("money", () => {
  it("parses INR amounts with Indian grouping into paise", () => {
    expect(toMinor("1,80,000")).toBe(18_000_000);
    expect(toMinor("1,80,000.50")).toBe(18_000_050);
    expect(toMinor("0.1")).toBe(10);
    expect(toMinor(12.34)).toBe(1234);
  });

  it("avoids floating point errors (0.1 + 0.2)", () => {
    expect(toMinor("0.1") + toMinor("0.2")).toBe(toMinor("0.3"));
    expect(fromMinor(toMinor("0.1") + toMinor("0.2"))).toBe("0.30");
  });

  it("respects currency exponents", () => {
    expect(toMinor("1500", "JPY")).toBe(1500);
    expect(() => toMinor("15.5", "JPY")).toThrow(MoneyError);
    expect(toMinor("1.234", "KWD")).toBe(1234);
    expect(() => toMinor("1.234", "INR")).toThrow(/decimal places/);
  });

  it("rejects invalid, empty and oversized input", () => {
    expect(() => toMinor("")).toThrow(MoneyError);
    expect(() => toMinor("abc")).toThrow(MoneyError);
    expect(() => toMinor("1e5")).toThrow(MoneyError);
    expect(() => toMinor("99999999999999999")).toThrow(/too large/);
  });

  it("handles negative and zero values", () => {
    expect(toMinor("-5.25")).toBe(-525);
    expect(toMinor("0")).toBe(0);
  });

  it("formats in en-IN with lakh grouping", () => {
    expect(formatMoney(18_000_000)).toBe("₹1,80,000");
    expect(formatMoney(18_000_050)).toBe("₹1,80,000.50");
    expect(formatMoney(150_000, "USD")).toBe("$1,500");
    expect(formatMoneyPlain(18_000_000)).toBe("INR 1,80,000.00");
  });

  it("computes safe percentages and divisions", () => {
    expect(percent(6_000_000, 18_000_000)).toBe(33.33);
    expect(percent(5, 0)).toBe(0);
    expect(divideMinor(100, 3, "ceil")).toBe(34);
    expect(divideMinor(100, 3, "floor")).toBe(33);
    expect(divideMinor(100, 0)).toBe(0);
    expect(sumMinor([1, 2, 3])).toBe(6);
  });
});
