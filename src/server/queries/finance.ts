import "server-only";
import { cache } from "react";
import type { ServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
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
import { fetchAll } from "./util";
import { summarizeHolding } from "@/lib/finance/investments";
import { averageMonthlyContribution, computeGoalPlan, deriveGoalStatus, estimateCompletionDate, type GoalStatus } from "@/lib/finance/goals";
import { computeNetWorth } from "@/lib/finance/networth";

export const db = cache(async () => createClient());

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const getCategories = cache(async () => {
  const supabase = await db();
  const [inc, exp] = await Promise.all([
    supabase.from("income_categories").select("*").order("name"),
    supabase.from("expense_categories").select("*").order("name"),
  ]);
  if (inc.error) throw new Error(inc.error.message);
  if (exp.error) throw new Error(exp.error.message);
  const expense = (exp.data ?? []) as Category[];
  const childrenOf = new Map<string, string[]>();
  for (const c of expense) if (c.parent_id) childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c.id]);
  return { income: (inc.data ?? []) as Category[], expense, childrenOf };
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

export async function getTransactions(f: TxFilters = {}, limit?: number): Promise<Transaction[]> {
  const supabase = await db();
  const build = (from: number, to: number) => {
    let q = supabase.from("transactions").select("*").is("deleted_at", null).order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
    if (f.from) q = q.gte("occurred_on", f.from);
    if (f.to) q = q.lte("occurred_on", f.to);
    if (f.type) q = q.eq("type", f.type);
    if (f.status) q = q.eq("status", f.status);
    if (f.paymentMethod) q = q.eq("payment_method", f.paymentMethod);
    if (f.categoryId) q = q.or(`expense_category_id.eq.${f.categoryId},income_category_id.eq.${f.categoryId}`);
    if (f.search) {
      const s = f.search.replace(/[%_,().*]/g, " ").trim().slice(0, 60);
      if (s) q = q.or(`title.ilike.%${s}%,merchant.ilike.%${s}%,source.ilike.%${s}%,notes.ilike.%${s}%`);
    }
    return q.range(from, to);
  };
  if (limit) {
    const { data, error } = await build(0, limit - 1);
    if (error) throw new Error(error.message);
    return (data ?? []) as Transaction[];
  }
  return fetchAll<Transaction>(build as never);
}

export const getRecurring = cache(async (): Promise<RecurringTransaction[]> => {
  const supabase = await db();
  const { data, error } = await supabase.from("recurring_transactions").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecurringTransaction[];
});

export const getCashSummary = cache(async (): Promise<CashSummary> => {
  const supabase = await db();
  const { data, error } = await supabase.rpc("cash_summary");
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as CashSummary | undefined;
  return (
    row ?? { opening_balance_minor: 0, income_minor: 0, expense_minor: 0, savings_net_minor: 0, goals_net_minor: 0, investments_net_minor: 0, debt_payments_minor: 0, cash_balance_minor: 0 }
  );
});

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export const getBudgets = cache(async (): Promise<Budget[]> => {
  const supabase = await db();
  const { data, error } = await supabase.from("budgets").select("*").is("deleted_at", null).order("period").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Budget[];
});

// ---------------------------------------------------------------------------
// Savings
// ---------------------------------------------------------------------------
export interface SavingsAccountView extends SavingsAccount {
  balanceMinor: number;
  linkedGoalId: string | null;
  depositedThisMonthMinor: number;
}

export const getSavings = cache(async (monthStart?: string) => {
  const supabase = await db();
  const [accounts, balances, txs, goals] = await Promise.all([
    supabase.from("savings_accounts").select("*").is("deleted_at", null).order("created_at"),
    supabase.from("savings_account_balances").select("*"),
    fetchAll<SavingsTransaction>((a, b) => supabase.from("savings_transactions").select("*").order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range(a, b) as never),
    supabase.from("financial_goals").select("id, savings_account_id").is("deleted_at", null).not("savings_account_id", "is", null),
  ]);
  if (accounts.error) throw new Error(accounts.error.message);
  const bal = new Map((balances.data ?? []).map((b: { account_id: string; balance_minor: number }) => [b.account_id, Number(b.balance_minor)]));
  const linked = new Map((goals.data ?? []).map((g: { id: string; savings_account_id: string }) => [g.savings_account_id, g.id]));
  const ms = monthStart ?? "0000-00-00";
  const list: SavingsAccountView[] = ((accounts.data ?? []) as SavingsAccount[]).map((a) => ({
    ...a,
    balanceMinor: bal.get(a.id) ?? 0,
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
  const supabase = await db();
  const [goals, progress, contributions, savings] = await Promise.all([
    supabase.from("financial_goals").select("*").is("deleted_at", null).order("target_date"),
    supabase.from("goal_progress").select("*"),
    fetchAll<GoalContribution>((a, b) => supabase.from("goal_contributions").select("*").order("occurred_on", { ascending: false }).range(a, b) as never),
    supabase.from("savings_transactions").select("account_id, type, amount_minor, occurred_on"),
  ]);
  if (goals.error) throw new Error(goals.error.message);
  const saved = new Map((progress.data ?? []).map((p: { goal_id: string; saved_minor: number }) => [p.goal_id, Number(p.saved_minor)]));
  return ((goals.data ?? []) as FinancialGoal[]).map((g) => {
    const own = contributions.filter((c) => c.goal_id === g.id);
    // Linked goals use the bucket's deposits as their contribution history.
    const history = g.savings_account_id
      ? (savings.data ?? [])
          .filter((t: { account_id: string }) => t.account_id === g.savings_account_id)
          .map((t: { type: string; amount_minor: number; occurred_on: string }) => ({ amountMinor: t.type === "deposit" || t.type === "transfer_in" ? t.amount_minor : -t.amount_minor, date: t.occurred_on }))
      : own.map((c) => ({ amountMinor: c.amount_minor, date: c.occurred_on }));
    const savedMinor = saved.get(g.id) ?? 0;
    const plan = computeGoalPlan({ targetMinor: g.target_amount_minor, savedMinor, today, targetDate: g.target_date });
    const monthlyPaceMinor = averageMonthlyContribution(history, today);
    const derivedStatus = deriveGoalStatus({
      storedStatus: g.status,
      targetMinor: g.target_amount_minor,
      savedMinor,
      today,
      targetDate: g.target_date,
      monthlyPaceMinor,
      hasContributions: history.length > 0,
      createdOn: g.created_at.slice(0, 10),
    });
    return { ...g, savedMinor, contributions: own, plan, derivedStatus, monthlyPaceMinor, etaDate: estimateCompletionDate(plan.remainingMinor, monthlyPaceMinor, today) };
  });
});

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------
export interface InvestmentView extends Investment {
  txs: InvestmentTransaction[];
  investedMinor: number;
  realizedGainMinor: number;
  units: number;
  pnlMinor: number;
}

export const getInvestments = cache(async (): Promise<InvestmentView[]> => {
  const supabase = await db();
  const [inv, txs] = await Promise.all([
    supabase.from("investments").select("*").is("deleted_at", null).order("created_at"),
    fetchAll<InvestmentTransaction>((a, b) => supabase.from("investment_transactions").select("*").order("occurred_on").order("created_at").range(a, b) as never),
  ]);
  if (inv.error) throw new Error(inv.error.message);
  return ((inv.data ?? []) as Investment[]).map((i) => {
    const own = txs.filter((t) => t.investment_id === i.id);
    const s = summarizeHolding(own, i.current_value_minor);
    return { ...i, txs: own, investedMinor: s.investedMinor, realizedGainMinor: s.realizedGainMinor, units: s.units, pnlMinor: i.current_value_minor - s.investedMinor };
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
  const supabase = await db();
  const [debts, balances, payments] = await Promise.all([
    supabase.from("debts").select("*").is("deleted_at", null).order("created_at"),
    supabase.from("debt_balances").select("*"),
    fetchAll<DebtPayment>((a, b) => supabase.from("debt_payments").select("*").order("paid_on", { ascending: false }).range(a, b) as never),
  ]);
  if (debts.error) throw new Error(debts.error.message);
  const bal = new Map((balances.data ?? []).map((b: { debt_id: string; outstanding_minor: number; principal_paid_minor: number; interest_paid_minor: number }) => [b.debt_id, b]));
  return ((debts.data ?? []) as Debt[]).map((d) => {
    const b = bal.get(d.id);
    return {
      ...d,
      interest_rate: Number(d.interest_rate),
      outstandingMinor: Number(b?.outstanding_minor ?? d.opening_outstanding_minor),
      principalPaidMinor: Number(b?.principal_paid_minor ?? 0),
      interestPaidMinor: Number(b?.interest_paid_minor ?? 0),
      payments: payments.filter((p) => p.debt_id === d.id),
    };
  });
});

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------
export const getManualBalances = cache(async () => {
  const supabase = await db();
  const [a, l] = await Promise.all([
    supabase.from("assets").select("*").is("deleted_at", null).order("value_minor", { ascending: false }),
    supabase.from("liabilities").select("*").is("deleted_at", null).order("amount_minor", { ascending: false }),
  ]);
  return { assets: (a.data ?? []) as ManualAsset[], liabilities: (l.data ?? []) as ManualLiability[] };
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

export async function getSnapshots(supabase: ServerSupabase, limit = 24): Promise<FinancialSnapshot[]> {
  const { data } = await supabase.from("financial_snapshots").select("*").order("snapshot_month", { ascending: false }).limit(limit);
  return ((data ?? []) as FinancialSnapshot[]).reverse();
}
