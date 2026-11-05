import "server-only";
import { cache } from "react";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { getSessionUser } from "@/lib/auth";
import type {
  Budget,
  CashSummary,
  Category,
  Debt,
  DebtPayment,
  FinancialGoal,
  FinancialSnapshot,
  GoalContribution,
  Investment,
  InvestmentTransaction,
  ManualAsset,
  ManualLiability,
  RecurringTransaction,
  SavingsAccount,
  SavingsTransaction,
  Transaction,
} from "@/types/database";
import { summarizeHolding } from "@/lib/finance/investments";
import { averageMonthlyContribution, computeGoalPlan, deriveGoalStatus, estimateCompletionDate, type GoalStatus } from "@/lib/finance/goals";
import { computeNetWorth } from "@/lib/finance/networth";
import { cashSummary, type MonthRollup } from "@/server/data/ledger";
import { loadWorkspace } from "@/lib/auth";

/**
 * Read models. The uid always comes from the verified session cookie, and every
 * path is rooted at users/{uid}, so these loaders can only ever return the
 * caller's own documents.
 */
const uidOrThrow = cache(async () => {
  const u = await getSessionUser();
  if (!u) throw new Error("Not authenticated");
  return u.uid;
});

async function col<T>(name: string, opts?: Parameters<ReturnType<typeof getStore>["list"]>[1]): Promise<T[]> {
  const uid = await uidOrThrow();
  return (await getStore().list(userPath(uid, name), opts)) as unknown as T[];
}

const notDeleted = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);
const byCreated = <T extends { created_at?: string }>(rows: T[]) => [...rows].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const getCategories = cache(async () => {
  const [income, expense] = await Promise.all([col<Category>("income_categories"), col<Category>("expense_categories")]);
  const sort = (a: Category, b: Category) => a.name.localeCompare(b.name);
  income.sort(sort);
  expense.sort(sort);
  const childrenOf = new Map<string, string[]>();
  for (const c of expense) if (c.parent_id) childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c.id]);
  return { income, expense, childrenOf };
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export interface TxFilters {
  from?: string;
  to?: string;
  type?: "income" | "expense";
  categoryId?: string;
  paymentMethod?: string;
  search?: string;
  status?: "completed" | "expected";
}

/** Date-range query (single-field index), remaining filters applied in memory. */
export async function getTransactions(f: TxFilters = {}, limit?: number): Promise<Transaction[]> {
  const where: Array<[string, ">=" | "<=", string]> = [];
  if (f.from) where.push(["occurred_on", ">=", f.from]);
  if (f.to) where.push(["occurred_on", "<=", f.to]);
  let rows = notDeleted(await col<Transaction>("transactions", { where, orderBy: ["occurred_on", "desc"] }));
  if (f.type) rows = rows.filter((t) => t.type === f.type);
  if (f.status) rows = rows.filter((t) => t.status === f.status);
  if (f.paymentMethod) rows = rows.filter((t) => t.payment_method === f.paymentMethod);
  if (f.categoryId) {
    const { childrenOf } = await getCategories();
    const ids = new Set([f.categoryId, ...(childrenOf.get(f.categoryId) ?? [])]);
    rows = rows.filter((t) => ids.has(t.expense_category_id ?? "") || ids.has(t.income_category_id ?? ""));
  }
  if (f.search) {
    const s = f.search.toLowerCase().trim();
    if (s) rows = rows.filter((t) => [t.title, t.merchant, t.source, t.notes].some((v) => v?.toLowerCase().includes(s)));
  }
  rows.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return limit ? rows.slice(0, limit) : rows;
}

/** Monthly rollups (one small document per month). */
export const getMonthRollups = cache(async (fromKey: string, toKey: string) => {
  const rows = await col<MonthRollup & { id: string }>("months", { where: [["month", ">=", fromKey], ["month", "<=", toKey]] });
  return new Map(rows.map((r) => [r.id, r]));
});

export const getRecurring = cache(async (): Promise<RecurringTransaction[]> => byCreated(notDeleted(await col<RecurringTransaction & { deleted_at?: string | null }>("recurring_transactions"))).reverse());

export const getCashSummary = cache(async (): Promise<CashSummary> => {
  const uid = await uidOrThrow();
  const u = await getSessionUser();
  const ws = await loadWorkspace(uid, u?.email ?? "");
  return cashSummary(getStore(), uid, ws?.settings.opening_balance_minor ?? 0);
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export const getBudgets = cache(async (): Promise<Budget[]> => byCreated(notDeleted(await col<Budget & { deleted_at?: string | null }>("budgets"))));

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------
export interface SavingsAccountView extends SavingsAccount {
  balanceMinor: number;
  linkedGoalId: string | null;
  depositedThisMonthMinor: number;
}

export const getSavings = cache(async (monthStart?: string) => {
  const [accounts, txs, goals] = await Promise.all([
    col<SavingsAccount & { balance_minor: number; deleted_at?: string | null }>("savings_accounts"),
    col<SavingsTransaction>("savings_transactions"),
    col<{ id: string; savings_account_id: string | null; deleted_at?: string | null }>("financial_goals"),
  ]);
  txs.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
  const linked = new Map(notDeleted(goals).filter((g) => g.savings_account_id).map((g) => [g.savings_account_id!, g.id]));
  const ms = monthStart ?? "0000-00-00";
  const list: SavingsAccountView[] = byCreated(notDeleted(accounts)).map((a) => ({
    ...a,
    balanceMinor: a.balance_minor ?? 0,
    linkedGoalId: linked.get(a.id) ?? null,
    depositedThisMonthMinor: txs.filter((t) => t.account_id === a.id && t.occurred_on >= ms).reduce((s, t) => s + (t.type === "deposit" || t.type === "transfer_in" ? t.amount_minor : -t.amount_minor), 0),
  }));
  return { accounts: list, transactions: txs, totalMinor: list.reduce((s, a) => s + a.balanceMinor, 0) };
});

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export interface GoalView extends FinancialGoal {
  savedMinor: number;
  contributions: GoalContribution[];
  plan: ReturnType<typeof computeGoalPlan>;
  derivedStatus: GoalStatus;
  monthlyPaceMinor: number;
  etaDate: string | null;
}

export const getGoals = cache(async (today: string): Promise<GoalView[]> => {
  const [goals, contributions, savings] = await Promise.all([
    col<FinancialGoal & { saved_minor: number; deleted_at?: string | null }>("financial_goals"),
    col<GoalContribution>("goal_contributions"),
    getSavings(),
  ]);
  contributions.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const bal = new Map(savings.accounts.map((a) => [a.id, a.balanceMinor]));
  return notDeleted(goals)
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .map((g) => {
      const own = contributions.filter((c) => c.goal_id === g.id);
      const history = g.savings_account_id
        ? savings.transactions.filter((t) => t.account_id === g.savings_account_id).map((t) => ({ amountMinor: t.type === "deposit" || t.type === "transfer_in" ? t.amount_minor : -t.amount_minor, date: t.occurred_on }))
        : own.map((c) => ({ amountMinor: c.amount_minor, date: c.occurred_on }));
      const savedMinor = g.savings_account_id ? bal.get(g.savings_account_id) ?? 0 : g.saved_minor ?? 0;
      const plan = computeGoalPlan({ targetMinor: g.target_amount_minor, savedMinor, today, targetDate: g.target_date });
      const monthlyPaceMinor = averageMonthlyContribution(history, today);
      const derivedStatus = deriveGoalStatus({ storedStatus: g.status, targetMinor: g.target_amount_minor, savedMinor, today, targetDate: g.target_date, monthlyPaceMinor, hasContributions: history.length > 0, createdOn: g.created_at.slice(0, 10) });
      return { ...g, savedMinor, contributions: own, plan, derivedStatus, monthlyPaceMinor, etaDate: estimateCompletionDate(plan.remainingMinor, monthlyPaceMinor, today) };
    });
});

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------
export interface InvestmentView extends Investment {
  txs: InvestmentTransaction[];
  investedMinor: number;
  totalContributedMinor: number;
  realizedGainMinor: number;
  units: number;
  pnlMinor: number;
}

export const getInvestments = cache(async (): Promise<InvestmentView[]> => {
  const [inv, txs] = await Promise.all([col<Investment & { deleted_at?: string | null }>("investments"), col<InvestmentTransaction>("investment_transactions")]);
  txs.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at));
  return byCreated(notDeleted(inv)).map((i) => {
    const own = txs.filter((t) => t.investment_id === i.id);
    const s = summarizeHolding(own, i.current_value_minor);
    return { ...i, txs: own, investedMinor: s.investedMinor, totalContributedMinor: s.totalContributedMinor, realizedGainMinor: s.realizedGainMinor, units: s.units, pnlMinor: i.current_value_minor - s.investedMinor };
  });
});

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------
export interface DebtView extends Debt {
  outstandingMinor: number;
  principalPaidMinor: number;
  interestPaidMinor: number;
  payments: DebtPayment[];
}

export const getDebts = cache(async (): Promise<DebtView[]> => {
  const [debts, payments] = await Promise.all([
    col<Debt & { principal_paid_minor?: number; interest_paid_minor?: number; deleted_at?: string | null }>("debts"),
    col<DebtPayment>("debt_payments"),
  ]);
  payments.sort((a, b) => b.paid_on.localeCompare(a.paid_on));
  return byCreated(notDeleted(debts)).map((d) => ({
    ...d,
    interest_rate: Number(d.interest_rate),
    outstandingMinor: d.opening_outstanding_minor - (d.principal_paid_minor ?? 0),
    principalPaidMinor: d.principal_paid_minor ?? 0,
    interestPaidMinor: d.interest_paid_minor ?? 0,
    payments: payments.filter((p) => p.debt_id === d.id),
  }));
});

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------
export const getManualBalances = cache(async () => {
  const [a, l] = await Promise.all([col<ManualAsset & { deleted_at?: string | null }>("assets"), col<ManualLiability & { deleted_at?: string | null }>("liabilities")]);
  return { assets: notDeleted(a).sort((x, y) => y.value_minor - x.value_minor), liabilities: notDeleted(l).sort((x, y) => y.amount_minor - x.amount_minor) };
});

export const getNetWorth = cache(async (today: string, cashSource: "tracked" | "manual") => {
  const [cash, savings, goals, investments, debts, manual] = await Promise.all([getCashSummary(), getSavings(), getGoals(today), getInvestments(), getDebts(), getManualBalances()]);
  const goalAllocations = goals.filter((g) => !g.savings_account_id).reduce((s, g) => s + g.savedMinor, 0);
  const result = computeNetWorth({
    cashSource,
    trackedCashMinor: cash.cash_balance_minor,
    savingsBucketsMinor: savings.totalMinor,
    goalAllocationsMinor: goalAllocations,
    investmentsMinor: investments.reduce((s, i) => s + i.current_value_minor, 0),
    manualAssets: manual.assets,
    debtsOutstandingMinor: debts.reduce((s, d) => s + d.outstandingMinor, 0),
    manualLiabilities: manual.liabilities,
  });
  return { ...result, cash, savings, goals, investments, debts, manual, goalAllocationsMinor: goalAllocations };
});

export async function getSnapshots(limit = 24): Promise<FinancialSnapshot[]> {
  const rows = await col<FinancialSnapshot>("financial_snapshots", { orderBy: ["snapshot_month", "desc"], limit });
  return rows.reverse();
}

export async function getUnreadCount(): Promise<number> {
  const uid = await uidOrThrow();
  return getStore().count(userPath(uid, "notifications"), [["read_at", "==", null]]);
}
