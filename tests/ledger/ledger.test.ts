import { beforeEach, describe, expect, it } from "vitest";
import { memoryStore } from "@/lib/firebase/memory-store";
import { LedgerError, userPath, type Store } from "@/lib/firebase/store";
import * as L from "@/server/data/ledger";

const U = "user_a";
const V = "user_b";
let s: ReturnType<typeof memoryStore>;

const expense = (amount: number, date = "2026-03-02", cat: string | null = null): L.TxInput => ({ type: "expense", status: "completed", title: "x", amount_minor: amount, currency: "INR", income_category_id: null, expense_category_id: cat, occurred_on: date, payment_method: "upi", merchant: null, source: null, notes: null, receipt_path: null });
const income = (amount: number, date = "2026-03-01", status: "completed" | "expected" = "completed"): L.TxInput => ({ ...expense(amount, date), type: "income", status, expense_category_id: null });
const cash = (st: Store = s, uid = U) => L.cashSummary(st, uid, 0).then((c) => c.cash_balance_minor);
const month = async (key: string, uid = U) => (await s.get<L.MonthRollup>(L.P.month(uid, key)))!;

beforeEach(async () => {
  s = memoryStore();
  await s.set(L.P.expenseCategory(U, "food"), { name: "Food" });
  await s.set(L.P.expenseCategory(V, "vfood"), { name: "Food" });
});

describe("transactions & rollups", () => {
  it("keeps cash and monthly totals in sync through create, edit, delete and restore", async () => {
    await L.createTransaction(s, U, "t1", income(100_000));
    await L.createTransaction(s, U, "t2", expense(20_000, "2026-03-02", "food"));
    await L.createTransaction(s, U, "t3", income(50_000, "2026-04-01", "expected"));
    expect(await cash()).toBe(80_000);
    expect(await month("2026-03")).toMatchObject({ income_minor: 100_000, expense_minor: 20_000, expense_by_category: { food: 20_000 } });
    expect((await month("2026-04")).expected_income_minor).toBe(50_000);

    await L.updateTransaction(s, U, "t2", { ...expense(30_000, "2026-04-05", null) });
    expect(await cash()).toBe(70_000);
    expect((await month("2026-03")).expense_minor).toBe(0);
    expect(await month("2026-04")).toMatchObject({ expense_minor: 30_000, expense_by_category: { none: 30_000 } });

    await L.setTransactionDeleted(s, U, "t2", true);
    await L.setTransactionDeleted(s, U, "t2", true); // idempotent
    expect(await cash()).toBe(100_000);
    await L.setTransactionDeleted(s, U, "t2", false);
    expect(await cash()).toBe(70_000);
  });

  it("is idempotent for repeated client submissions", async () => {
    expect(await L.createTransaction(s, U, "ref-1", expense(500))).toBe("created");
    expect(await L.createTransaction(s, U, "ref-1", expense(500))).toBe("duplicate");
    expect(await cash()).toBe(-500);
  });

  it("rejects zero/negative amounts, expected expenses and other users' categories", async () => {
    await expect(L.createTransaction(s, U, "a", expense(0))).rejects.toThrow(LedgerError);
    await expect(L.createTransaction(s, U, "b", expense(-5))).rejects.toThrow(LedgerError);
    await expect(L.createTransaction(s, U, "c", { ...expense(5), status: "expected" })).rejects.toThrow(/Only income/);
    await expect(L.createTransaction(s, U, "d", expense(5, "2026-03-01", "vfood"))).rejects.toThrow(/Category not found/);
  });

  it("isolates users completely", async () => {
    await L.createTransaction(s, U, "t1", income(100));
    expect(await cash(s, V)).toBe(0);
    await expect(L.setTransactionDeleted(s, V, "t1", true)).rejects.toThrow(/not found/);
    expect(await cash()).toBe(100);
    for (const key of s.dump().keys()) expect(key.startsWith("users/user_a/") || key.startsWith("users/user_b/")).toBe(true);
  });

  it("materialises recurring rules once per occurrence", async () => {
    await s.set(L.P.recurring(U, "rent"), { type: "expense", title: "Rent", amount_minor: 1000, currency: "INR", income_category_id: null, expense_category_id: "food", payment_method: "upi", merchant: null, source: null, notes: null, frequency: "monthly", interval_count: 1, start_date: "2026-01-31", end_date: null, last_generated_date: null, is_active: true });
    expect(await L.materializeRecurring(s, U, "2026-03-31")).toBe(3);
    expect(await L.materializeRecurring(s, U, "2026-03-31")).toBe(0);
    const ids = (await s.list(userPath(U, "transactions"))).map((t) => t.id).sort();
    expect(ids).toEqual(["rent_2026-01-31", "rent_2026-02-28", "rent_2026-03-31"]);
    expect(await cash()).toBe(-3000);
  });
});

describe("savings", () => {
  it("prevents overdrafts and keeps transfers cash-neutral", async () => {
    await L.createTransaction(s, U, "i", income(100_000));
    const a = await L.createSavingsAccount(s, U, { name: "Emergency", kind: "emergency" }, 0);
    const b = await L.createSavingsAccount(s, U, { name: "Trip", kind: "vacation" }, 5_000);
    expect(await cash()).toBe(100_000); // opening balance is external money
    await L.savingsMovement(s, U, { accountId: a, type: "deposit", amount: 20_000, affectsCash: true, occurredOn: "2026-03-03", note: null });
    expect(await cash()).toBe(80_000);
    await L.transferSavings(s, U, a, b, 5_000, "2026-03-04", null);
    expect(await cash()).toBe(80_000);
    expect((await s.get<{ balance_minor: number }>(L.P.savingsAccount(U, a)))!.balance_minor).toBe(15_000);
    expect((await s.get<{ balance_minor: number }>(L.P.savingsAccount(U, b)))!.balance_minor).toBe(10_000);
    await expect(L.savingsMovement(s, U, { accountId: a, type: "withdrawal", amount: 15_001, affectsCash: true, occurredOn: "2026-03-05", note: null })).rejects.toThrow(/Insufficient/);
    await expect(L.transferSavings(s, U, a, a, 1, "2026-03-05", null)).rejects.toThrow(/different/);
    await expect(L.transferSavings(s, V, a, b, 1, "2026-03-05", null)).rejects.toThrow(/not found/);
    // Income/expense totals untouched by savings activity.
    const t = await L.cashSummary(s, U, 0);
    expect([t.income_minor, t.expense_minor]).toEqual([100_000, 0]);
  });

  it("deleting a transfer leg removes both legs and restores balances", async () => {
    const a = await L.createSavingsAccount(s, U, { name: "A" }, 1_000);
    const b = await L.createSavingsAccount(s, U, { name: "B" }, 0);
    const g = await L.transferSavings(s, U, a, b, 400, "2026-03-01", null);
    await L.deleteSavingsEntry(s, U, `${g}_in`);
    expect((await s.list(userPath(U, "savings_transactions"))).filter((x) => x.transfer_group === g)).toHaveLength(0);
    expect((await s.get<{ balance_minor: number }>(L.P.savingsAccount(U, a)))!.balance_minor).toBe(1_000);
  });

  it("serialises concurrent withdrawals so the balance never goes negative", async () => {
    const a = await L.createSavingsAccount(s, U, { name: "Race" }, 1_000);
    const w = () => L.savingsMovement(s, U, { accountId: a, type: "withdrawal", amount: 800, affectsCash: false, occurredOn: "2026-03-01", note: null });
    const r = await Promise.allSettled([w(), w(), w()]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await s.get<{ balance_minor: number }>(L.P.savingsAccount(U, a)))!.balance_minor).toBe(200);
  });

  it("only empty accounts can be deleted", async () => {
    const a = await L.createSavingsAccount(s, U, { name: "A" }, 10);
    await expect(L.deleteSavingsAccount(s, U, a)).rejects.toThrow(/remaining balance/);
  });
});

describe("goals", () => {
  it("tracks allocations, caps withdrawals and returns cash on delete", async () => {
    const g = await L.createGoal(s, U, { name: "MacBook", target_amount_minor: 18_000_000, savings_account_id: null }, 2_000_000, true);
    expect(await cash()).toBe(-2_000_000);
    await L.contributeToGoal(s, U, { goalId: g, amount: 1_000_000, affectsCash: true, occurredOn: "2026-03-01", note: null });
    expect((await s.get<{ saved_minor: number }>(L.P.goal(U, g)))!.saved_minor).toBe(3_000_000);
    await expect(L.contributeToGoal(s, U, { goalId: g, amount: -3_000_001, affectsCash: true, occurredOn: "2026-03-01", note: null })).rejects.toThrow(/more than the amount allocated/);
    await L.deleteGoal(s, U, g);
    expect(await cash()).toBe(0);
  });

  it("marks goals complete when the target is reached", async () => {
    const g = await L.createGoal(s, U, { name: "Phone", target_amount_minor: 1000, savings_account_id: null }, 0, false);
    await L.contributeToGoal(s, U, { goalId: g, amount: 1000, affectsCash: false, occurredOn: "2026-03-01", note: null });
    expect((await s.get<{ status: string }>(L.P.goal(U, g)))!.status).toBe("completed");
  });

  it("linked goals use the bucket and a bucket backs only one goal", async () => {
    const a = await L.createSavingsAccount(s, U, { name: "Car" }, 0);
    const g = await L.createGoal(s, U, { name: "Car", target_amount_minor: 1000, savings_account_id: a }, 0, false);
    await expect(L.contributeToGoal(s, U, { goalId: g, amount: 10, affectsCash: false, occurredOn: "2026-03-01", note: null })).rejects.toThrow(/linked savings account/);
    await expect(L.createGoal(s, U, { name: "Car 2", target_amount_minor: 1000, savings_account_id: a }, 0, false)).rejects.toThrow(/already backs/);
    await expect(L.createGoal(s, U, { name: "X", target_amount_minor: 1000, savings_account_id: a }, 50, false)).rejects.toThrow(/uses that account/);
  });
});

describe("investments & debts", () => {
  it("tracks investment value and cash effects", async () => {
    const id = await L.createInvestment(s, U, { name: "Index", asset_type: "mutual_fund", purchase_date: "2026-01-01" }, { amount: 100_000, units: 10, pricePerUnit: 10_000, fromCash: true }, 120_000);
    expect((await s.get<{ current_value_minor: number }>(L.P.investment(U, id)))!.current_value_minor).toBe(120_000);
    expect(await cash()).toBe(-100_000);
    await L.addInvestmentTx(s, U, { investmentId: id, type: "sell", amount: 20_000, units: 2, affectsCash: true, occurredOn: "2026-02-01", note: null });
    expect(await cash()).toBe(-80_000);
    await L.addInvestmentTx(s, U, { investmentId: id, type: "valuation", amount: 90_000, units: null, affectsCash: true, occurredOn: "2026-03-01", note: null });
    expect(await cash()).toBe(-80_000); // valuations never touch cash
    await L.deleteInvestment(s, U, id);
    expect(await cash()).toBe(0);
  });

  it("caps principal repayments at the outstanding amount", async () => {
    await s.set(L.P.debt(U, "loan"), { name: "Loan", opening_outstanding_minor: 50_000, principal_paid_minor: 0, interest_paid_minor: 0, payment_count: 0 });
    await L.recordDebtPayment(s, U, { debtId: "loan", amount: 40_000, principal: 39_500, interest: 500, affectsCash: true, paidOn: "2026-03-01", note: null });
    await expect(L.recordDebtPayment(s, U, { debtId: "loan", amount: 20_000, principal: 20_000, interest: 0, affectsCash: true, paidOn: "2026-03-02", note: null })).rejects.toThrow(/cannot exceed/);
    await expect(L.recordDebtPayment(s, U, { debtId: "loan", amount: 100, principal: 10, interest: 10, affectsCash: true, paidOn: "2026-03-02", note: null })).rejects.toThrow(/add up/);
    const r = await L.recordDebtPayment(s, U, { debtId: "loan", amount: 10_500, principal: 10_500, interest: 0, affectsCash: true, paidOn: "2026-03-03", note: null });
    expect(r.paidOff).toBe(true);
    expect(await cash()).toBe(-50_500);
    await expect(L.recordDebtPayment(s, V, { debtId: "loan", amount: 1, principal: 1, interest: 0, affectsCash: true, paidOn: "2026-03-03", note: null })).rejects.toThrow(/not found/);
  });
});
