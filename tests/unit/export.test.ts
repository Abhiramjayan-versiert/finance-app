import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { toCsv } from "@/lib/export/csv";
import { toXlsx } from "@/lib/export/xlsx";
import * as S from "@/lib/validation/schemas";

describe("CSV export", () => {
  it("quotes, escapes and adds an Excel BOM", () => {
    const csv = toCsv(["Title", "Amount"], [["Tea, coffee", 12.5], ['He said "hi"', -3], ["multi\nline", null]], { bom: true });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Tea, coffee",12.5');
    expect(csv).toContain('"He said ""hi""",-3');
    expect(csv).toContain('"multi\nline",');
  });
  it("neutralises spreadsheet formula injection", () => {
    expect(toCsv(["x"], [["=HYPERLINK(\"evil\")"], ["+1"], ["@SUM(A1)"]])).toContain("'=HYPERLINK");
    expect(toCsv(["x"], [["-5 items"]])).toContain("'-5 items");
    expect(toCsv(["x"], [[-5]])).toContain("-5");
  });
});

describe("XLSX export", () => {
  it("produces a valid workbook zip with escaped values", () => {
    const files = unzipSync(toXlsx("Report", ["Name", "Amount"], [["<b>&", 10], ["Rent", 25000.5]]));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("&lt;b&gt;&amp;");
    expect(sheet).toContain("<v>25000.5</v>");
  });
});

describe("validation schemas", () => {
  it("parses transactions into minor units and rejects bad input", () => {
    const ok = S.transactionSchema("INR").safeParse({ type: "expense", title: "Lunch", amount: "1,250.50", occurredOn: "2026-02-28", paymentMethod: "upi" });
    expect(ok.success && ok.data.amount).toBe(125050);
    expect(S.transactionSchema("INR").safeParse({ type: "expense", title: "", amount: "-1", occurredOn: "2026-02-30", paymentMethod: "upi" }).success).toBe(false);
    expect(S.transactionSchema("INR").safeParse({ type: "expense", status: "expected", title: "x", amount: "1", occurredOn: "2026-01-01", paymentMethod: "upi" }).success).toBe(false);
    expect(S.transactionSchema("INR").safeParse({ type: "income", title: "x", amount: "1", occurredOn: "2026-01-01", paymentMethod: "carrier-pigeon" }).success).toBe(false);
  });
  it("accepts leap days only in leap years", () => {
    const base = { type: "expense", title: "x", amount: "1", paymentMethod: "cash" };
    expect(S.transactionSchema("INR").safeParse({ ...base, occurredOn: "2028-02-29" }).success).toBe(true);
    expect(S.transactionSchema("INR").safeParse({ ...base, occurredOn: "2027-02-29" }).success).toBe(false);
  });
  it("requires a frequency for recurring entries", () => {
    expect(S.transactionSchema("INR").safeParse({ type: "expense", title: "Rent", amount: "1", occurredOn: "2026-01-01", paymentMethod: "upi", recurring: "on" }).success).toBe(false);
  });
  it("validates registration rules", () => {
    expect(S.registerSchema.safeParse({ fullName: "A", email: "a@b.co", password: "Passw0rdX", confirmPassword: "Passw0rdX", terms: "on" }).success).toBe(true);
    expect(S.registerSchema.safeParse({ fullName: "A", email: "a@b.co", password: "password", confirmPassword: "password", terms: "on" }).success).toBe(false);
    expect(S.registerSchema.safeParse({ fullName: "A", email: "a@b.co", password: "Passw0rdX", confirmPassword: "Passw0rdX" }).success).toBe(false);
  });
  it("validates budget thresholds and goal URLs", () => {
    const b = S.budgetSchema("INR").safeParse({ name: "Food", period: "monthly", amount: "6000", thresholds: "90, 50,75", startDate: "2026-01-01" });
    expect(b.success && b.data.thresholds).toEqual([50, 75, 90]);
    expect(S.budgetSchema("INR").safeParse({ name: "Food", period: "monthly", amount: "6000", thresholds: "0,500", startDate: "2026-01-01" }).success).toBe(false);
    expect(S.goalSchema("INR").safeParse({ name: "Mac", category: "gadgets", targetAmount: "180000", targetDate: "2027-01-01", priority: "high", productUrl: "javascript:alert(1)" }).success).toBe(false);
  });
  it("handles currencies without decimals", () => {
    expect(S.transactionSchema("JPY").safeParse({ type: "expense", title: "x", amount: "100.5", occurredOn: "2026-01-01", paymentMethod: "cash" }).success).toBe(false);
  });
});
