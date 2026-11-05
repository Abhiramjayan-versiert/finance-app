import "server-only";
import { LedgerError, NotFoundError, userPath, type Store, type Tx } from "@/lib/firebase/store";
import { dueOccurrences } from "@/lib/finance/recurrence";
import type { RecurringTransaction, Transaction } from "@/types/database";

/**
 * All money-moving writes. Each operation runs inside one Firestore
 * transaction that (1) reads every document whose value it depends on,
 * (2) validates invariants, (3) writes the ledger entry together with the
 * updated running totals. Conflicting transactions are retried by Firestore,
 * so balances can never be overdrawn by concurrent requests.
 *
 * Running totals:
 *  users/{uid}/meta/ledger      cash-affecting totals (income, expenses, net moves into savings/goals/investments, debt payments)
 *  users/{uid}/months/{yyyy-mm} per-month income/expense totals by category (powers dashboards cheaply)
 *  balance fields on savings accounts, goals, investments and debts
 */

export interface LedgerTotals {
  income_minor: number;
  expected_income_minor: number;
  expense_minor: number;
  savings_net_minor: number;
  goals_net_minor: number;
  investments_net_minor: number;
  debt_payments_minor: number;
}

export interface MonthRollup {
  income_minor: number;
  expected_income_minor: number;
  expense_minor: number;
  tx_count: number;
  expense_by_category: Record<string, number>;
  income_by_category: Record<string, number>;
}

const ZERO_TOTALS: LedgerTotals = { income_minor: 0, expected_income_minor: 0, expense_minor: 0, savings_net_minor: 0, goals_net_minor: 0, investments_net_minor: 0, debt_payments_minor: 0 };
const emptyMonth = (): MonthRollup => ({ income_minor: 0, expected_income_minor: 0, expense_minor: 0, tx_count: 0, expense_by_category: {}, income_by_category: {} });
const now = () => new Date().toISOString();

export const P = {
  ledger: (uid: string) => userPath(uid, "meta", "ledger"),
  month: (uid: string, key: string) => userPath(uid, "months", key),
  tx: (uid: string, id: string) => userPath(uid, "transactions", id),
  recurring: (uid: string, id: string) => userPath(uid, "recurring_transactions", id),
  savingsAccount: (uid: string, id: string) => userPath(uid, "savings_accounts", id),
  savingsTx: (uid: string, id: string) => userPath(uid, "savings_transactions", id),
  goal: (uid: string, id: string) => userPath(uid, "financial_goals", id),
  contribution: (uid: string, id: string) => userPath(uid, "goal_contributions", id),
  investment: (uid: string, id: string) => userPath(uid, "investments", id),
  investmentTx: (uid: string, id: string) => userPath(uid, "investment_transactions", id),
  debt: (uid: string, id: string) => userPath(uid, "debts", id),
  debtPayment: (uid: string, id: string) => userPath(uid, "debt_payments", id),
  expenseCategory: (uid: string, id: string) => userPath(uid, "expense_categories", id),
  incomeCategory: (uid: string, id: string) => userPath(uid, "income_categories", id),
};

// ---------------------------------------------------------------------------
// Running-total plumbing
// ---------------------------------------------------------------------------
class Totals {
  totals: LedgerTotals = { ...ZERO_TOTALS };
  months = new Map<string, MonthRollup>();
  constructor(private uid: string) {}

  async load(tx: Tx, monthKeys: string[] = []) {
    const t = await tx.get<LedgerTotals & { id: string }>(P.ledger(this.uid));
    if (t) {
      const { id: _id, ...rest } = t;
      this.totals = { ...ZERO_TOTALS, ...rest };
    }
    for (const k of new Set(monthKeys)) {
      const m = await tx.get<MonthRollup & { id: string }>(P.month(this.uid, k));
      if (m) {
        const { id: _id, ...rest } = m;
        this.months.set(k, { ...emptyMonth(), ...rest });
      } else this.months.set(k, emptyMonth());
    }
    return this;
  }

  cash(field: keyof LedgerTotals, delta: number) {
    this.totals[field] += delta;
  }

  /** Apply (sign = +1) or reverse (sign = -1) one income/expense transaction. */
  transaction(t: Pick<Transaction, "type" | "status" | "amount_minor" | "occurred_on" | "income_category_id" | "expense_category_id">, sign: 1 | -1) {
    const m = this.months.get(t.occurred_on.slice(0, 7));
    if (!m) throw new Error("Month rollup not loaded");
    const a = t.amount_minor * sign;
    m.tx_count += sign;
    if (t.type === "expense") {
      this.totals.expense_minor += a;
      m.expense_minor += a;
      const k = t.expense_category_id ?? "none";
      m.expense_by_category[k] = (m.expense_by_category[k] ?? 0) + a;
      if (m.expense_by_category[k] === 0) delete m.expense_by_category[k];
    } else if (t.status === "expected") {
      this.totals.expected_income_minor += a;
      m.expected_income_minor += a;
    } else {
      this.totals.income_minor += a;
      m.income_minor += a;
      const k = t.income_category_id ?? "none";
      m.income_by_category[k] = (m.income_by_category[k] ?? 0) + a;
      if (m.income_by_category[k] === 0) delete m.income_by_category[k];
    }
  }

  save(tx: Tx) {
    tx.set(P.ledger(this.uid), { ...this.totals, updated_at: now() });
    for (const [k, m] of this.months) tx.set(P.month(this.uid, k), { ...m, month: k, updated_at: now() });
  }
}

// ---------------------------------------------------------------------------
// Transactions (income & expenses)
// ---------------------------------------------------------------------------
export interface TxInput {
  type: "income" | "expense";
  status: "completed" | "expected";
  title: string;
  amount_minor: number;
  currency: string;
  income_category_id: string | null;
  expense_category_id: string | null;
  occurred_on: string;
  payment_method: Transaction["payment_method"];
  merchant: string | null;
  source: string | null;
  notes: string | null;
  receipt_path: string | null;
  is_recurring?: boolean;
  recurring_id?: string | null;
  occurrence_date?: string | null;
}

async function assertCategory(tx: Tx, uid: string, input: Pick<TxInput, "type" | "income_category_id" | "expense_category_id">) {
  if (input.type === "expense" && input.expense_category_id && !(await tx.get(P.expenseCategory(uid, input.expense_category_id)))) throw new LedgerError("Category not found");
  if (input.type === "income" && input.income_category_id && !(await tx.get(P.incomeCategory(uid, input.income_category_id)))) throw new LedgerError("Category not found");
}

/** Creates a transaction with a caller-supplied id (client_ref makes retries idempotent). */
export async function createTransaction(store: Store, uid: string, id: string, input: TxInput): Promise<"created" | "duplicate"> {
  if (input.amount_minor <= 0) throw new LedgerError("Amount must be greater than zero");
  if (input.type === "expense" && input.status !== "completed") throw new LedgerError("Only income can be marked as expected");
  return store.transaction(async (tx) => {
    if (await tx.get(P.tx(uid, id))) return "duplicate";
    await assertCategory(tx, uid, input);
    const totals = await new Totals(uid).load(tx, [input.occurred_on.slice(0, 7)]);
    const doc = { ...input, user_id: uid, is_recurring: !!input.is_recurring, recurring_id: input.recurring_id ?? null, occurrence_date: input.occurrence_date ?? null, created_at: now(), updated_at: now(), deleted_at: null };
    totals.transaction(doc, 1);
    tx.create(P.tx(uid, id), doc);
    totals.save(tx);
    return "created";
  });
}

export async function updateTransaction(store: Store, uid: string, id: string, input: Omit<TxInput, "currency" | "is_recurring" | "recurring_id" | "occurrence_date">) {
  if (input.amount_minor <= 0) throw new LedgerError("Amount must be greater than zero");
  return store.transaction(async (tx) => {
    const before = await tx.get<Transaction>(P.tx(uid, id));
    if (!before || before.deleted_at) throw new NotFoundError("Transaction not found");
    const after = { ...before, ...input, type: before.type, status: before.type === "expense" ? "completed" : input.status };
    await assertCategory(tx, uid, after);
    const totals = await new Totals(uid).load(tx, [before.occurred_on.slice(0, 7), after.occurred_on.slice(0, 7)]);
    totals.transaction(before, -1);
    totals.transaction(after, 1);
    const { id: _id, ...rest } = after;
    tx.set(P.tx(uid, id), { ...rest, updated_at: now() });
    totals.save(tx);
  });
}

export async function setTransactionDeleted(store: Store, uid: string, id: string, deleted: boolean) {
  return store.transaction(async (tx) => {
    const t = await tx.get<Transaction>(P.tx(uid, id));
    if (!t) throw new NotFoundError("Transaction not found");
    if (!!t.deleted_at === deleted) return;
    const totals = await new Totals(uid).load(tx, [t.occurred_on.slice(0, 7)]);
    totals.transaction(t, deleted ? -1 : 1);
    tx.update(P.tx(uid, id), { deleted_at: deleted ? now() : null, updated_at: now() });
    totals.save(tx);
  });
}

/** Generates due occurrences of every active rule. Idempotent: ids are `${ruleId}_${date}`. */
export async function materializeRecurring(store: Store, uid: string, today: string): Promise<number> {
  const rules = (await store.list<RecurringTransaction & { deleted_at?: string | null }>(userPath(uid, "recurring_transactions"), { where: [["is_active", "==", true]] })).filter((r) => !r.deleted_at && r.start_date <= today && (!r.last_generated_date || r.last_generated_date < today));
  let created = 0;
  for (const r of rules) {
    const dates = dueOccurrences({ frequency: r.frequency, interval: r.interval_count, startDate: r.start_date, endDate: r.end_date }, r.last_generated_date, today, 120);
    for (const d of dates) {
      const res = await createTransaction(store, uid, `${r.id}_${d}`, {
        type: r.type, status: "completed", title: r.title, amount_minor: r.amount_minor, currency: r.currency,
        income_category_id: r.type === "income" ? r.income_category_id : null, expense_category_id: r.type === "expense" ? r.expense_category_id : null,
        occurred_on: d, payment_method: r.payment_method, merchant: r.merchant, source: r.source, notes: r.notes, receipt_path: null,
        is_recurring: true, recurring_id: r.id, occurrence_date: d,
      }).catch((e) => {
        if (e instanceof LedgerError) return "duplicate" as const; // e.g. category deleted
        throw e;
      });
      if (res === "created") created++;
    }
    if (dates.length) await store.update(P.recurring(uid, r.id), { last_generated_date: dates[dates.length - 1], updated_at: now() });
  }
  return created;
}

// ---------------------------------------------------------------------------
// Savings buckets
// ---------------------------------------------------------------------------
interface AccountDoc { balance_minor: number; deleted_at?: string | null; name: string }

export async function createSavingsAccount(store: Store, uid: string, data: Record<string, unknown>, openingMinor: number) {
  const id = store.newId();
  await store.transaction(async (tx) => {
    tx.create(P.savingsAccount(uid, id), { ...data, user_id: uid, balance_minor: openingMinor > 0 ? openingMinor : 0, archived: false, created_at: now(), updated_at: now(), deleted_at: null });
    if (openingMinor > 0) tx.create(P.savingsTx(uid, store.newId()), { user_id: uid, account_id: id, type: "deposit", amount_minor: openingMinor, affects_cash: false, transfer_group: null, occurred_on: now().slice(0, 10), note: "Opening balance", is_opening: true, created_at: now() });
  });
  return id;
}

export async function savingsMovement(store: Store, uid: string, m: { accountId: string; type: "deposit" | "withdrawal"; amount: number; affectsCash: boolean; occurredOn: string; note: string | null; clientRef?: string | null }) {
  if (m.amount <= 0) throw new LedgerError("Amount must be greater than zero");
  const entryId = m.clientRef ?? store.newId();
  return store.transaction(async (tx) => {
    if (await tx.get(P.savingsTx(uid, entryId))) return "duplicate" as const;
    const acct = await tx.get<AccountDoc>(P.savingsAccount(uid, m.accountId));
    if (!acct || acct.deleted_at) throw new LedgerError("Savings account not found");
    if (m.type === "withdrawal" && acct.balance_minor < m.amount) throw new LedgerError("Insufficient balance in savings account");
    const totals = await new Totals(uid).load(tx);
    const delta = m.type === "deposit" ? m.amount : -m.amount;
    if (m.affectsCash) totals.cash("savings_net_minor", delta);
    tx.update(P.savingsAccount(uid, m.accountId), { balance_minor: acct.balance_minor + delta, updated_at: now() });
    tx.create(P.savingsTx(uid, entryId), { user_id: uid, account_id: m.accountId, type: m.type, amount_minor: m.amount, affects_cash: m.affectsCash, transfer_group: null, occurred_on: m.occurredOn, note: m.note, created_at: now() });
    totals.save(tx);
    return "created" as const;
  });
}

/** Moves money between two buckets atomically. Never touches cash, income or expenses. */
export async function transferSavings(store: Store, uid: string, from: string, to: string, amount: number, occurredOn: string, note: string | null) {
  if (from === to) throw new LedgerError("Choose two different savings accounts");
  if (amount <= 0) throw new LedgerError("Transfer amount must be positive");
  const group = store.newId();
  await store.transaction(async (tx) => {
    const a = await tx.get<AccountDoc>(P.savingsAccount(uid, from));
    const b = await tx.get<AccountDoc>(P.savingsAccount(uid, to));
    if (!a || !b || a.deleted_at || b.deleted_at) throw new LedgerError("Savings account not found");
    if (a.balance_minor < amount) throw new LedgerError("Insufficient balance in savings account");
    tx.update(P.savingsAccount(uid, from), { balance_minor: a.balance_minor - amount, updated_at: now() });
    tx.update(P.savingsAccount(uid, to), { balance_minor: b.balance_minor + amount, updated_at: now() });
    const base = { user_id: uid, amount_minor: amount, affects_cash: false, transfer_group: group, occurred_on: occurredOn, note, created_at: now() };
    tx.create(P.savingsTx(uid, `${group}_out`), { ...base, account_id: from, type: "transfer_out" });
    tx.create(P.savingsTx(uid, `${group}_in`), { ...base, account_id: to, type: "transfer_in" });
  });
  return group;
}

/** Removes a savings entry (both legs for transfers) if no balance would go negative. */
export async function deleteSavingsEntry(store: Store, uid: string, entryId: string) {
  await store.transaction(async (tx) => {
    const e = await tx.get<{ account_id: string; type: string; amount_minor: number; affects_cash: boolean; transfer_group: string | null }>(P.savingsTx(uid, entryId));
    if (!e) throw new NotFoundError("Entry not found");
    const legs = e.transfer_group ? [await tx.get<typeof e>(P.savingsTx(uid, `${e.transfer_group}_out`)), await tx.get<typeof e>(P.savingsTx(uid, `${e.transfer_group}_in`))].filter(Boolean) as Array<typeof e & { id: string }> : [e];
    const accounts = new Map<string, AccountDoc & { id: string }>();
    for (const l of legs) if (!accounts.has(l.account_id)) { const a = await tx.get<AccountDoc>(P.savingsAccount(uid, l.account_id)); if (a) accounts.set(l.account_id, a); }
    const totals = await new Totals(uid).load(tx);
    for (const l of legs) {
      const a = accounts.get(l.account_id);
      const plus = l.type === "deposit" || l.type === "transfer_in";
      if (a) a.balance_minor += plus ? -l.amount_minor : l.amount_minor;
      if (l.affects_cash) totals.cash("savings_net_minor", plus ? -l.amount_minor : l.amount_minor);
    }
    for (const a of accounts.values()) if (a.balance_minor < 0) throw new LedgerError("Deleting this entry would make the savings balance negative");
    for (const [id, a] of accounts) tx.update(P.savingsAccount(uid, id), { balance_minor: a.balance_minor, updated_at: now() });
    for (const l of legs) tx.delete(P.savingsTx(uid, l.id));
    totals.save(tx);
  });
}

export async function deleteSavingsAccount(store: Store, uid: string, accountId: string) {
  const entries = await store.list(userPath(uid, "savings_transactions"), { where: [["account_id", "==", accountId]] });
  await store.transaction(async (tx) => {
    const a = await tx.get<AccountDoc>(P.savingsAccount(uid, accountId));
    if (!a) throw new NotFoundError("Account not found");
    if (a.balance_minor !== 0) throw new LedgerError("Withdraw or transfer the remaining balance before deleting this account.");
    // A zero balance means cash effects net to zero already; just remove history.
    for (const e of entries) tx.delete(P.savingsTx(uid, e.id));
    tx.delete(P.savingsAccount(uid, accountId));
  });
  // Unlink any goal that used this bucket.
  for (const g of await store.list(userPath(uid, "financial_goals"), { where: [["savings_account_id", "==", accountId]] })) await store.update(P.goal(uid, g.id), { savings_account_id: null });
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
interface GoalDoc { saved_minor: number; savings_account_id: string | null; target_amount_minor: number; status: string; deleted_at?: string | null }

export async function createGoal(store: Store, uid: string, data: Record<string, unknown> & { savings_account_id: string | null }, initialMinor: number, initialFromCash: boolean) {
  if (initialMinor < 0) throw new LedgerError("Current savings cannot be negative");
  if (data.savings_account_id && initialMinor > 0) throw new LedgerError("A goal linked to a savings account uses that account's balance");
  const id = store.newId();
  await store.transaction(async (tx) => {
    if (data.savings_account_id) {
      const a = await tx.get<AccountDoc>(P.savingsAccount(uid, data.savings_account_id));
      if (!a || a.deleted_at) throw new LedgerError("Savings account not found");
      const linked = await linkedGoalId(store, uid, data.savings_account_id);
      if (linked) throw new LedgerError("That savings account already backs another goal.");
    }
    const totals = await new Totals(uid).load(tx);
    tx.create(P.goal(uid, id), { ...data, user_id: uid, saved_minor: initialMinor, status: initialMinor > 0 || data.savings_account_id ? "active" : "not_started", completed_at: null, created_at: now(), updated_at: now(), deleted_at: null });
    if (initialMinor > 0) {
      tx.create(P.contribution(uid, store.newId()), { user_id: uid, goal_id: id, amount_minor: initialMinor, affects_cash: initialFromCash, occurred_on: now().slice(0, 10), note: "Opening balance", is_opening: true, created_at: now() });
      if (initialFromCash) totals.cash("goals_net_minor", initialMinor);
    }
    totals.save(tx);
  });
  return id;
}

export async function linkedGoalId(store: Store, uid: string, accountId: string) {
  const g = (await store.list<{ deleted_at?: string | null }>(userPath(uid, "financial_goals"), { where: [["savings_account_id", "==", accountId]] })).filter((x) => !x.deleted_at);
  return g[0]?.id ?? null;
}

export async function updateGoal(store: Store, uid: string, id: string, patch: Record<string, unknown> & { savings_account_id: string | null }) {
  if (patch.savings_account_id) {
    const other = await linkedGoalId(store, uid, patch.savings_account_id);
    if (other && other !== id) throw new LedgerError("That savings account already backs another goal.");
  }
  await store.transaction(async (tx) => {
    const g = await tx.get<GoalDoc>(P.goal(uid, id));
    if (!g || g.deleted_at) throw new NotFoundError("Goal not found");
    if (patch.savings_account_id && patch.savings_account_id !== g.savings_account_id) {
      if (g.saved_minor !== 0) throw new LedgerError("Release this goal's direct allocations before linking a savings account");
      if (!(await tx.get(P.savingsAccount(uid, patch.savings_account_id)))) throw new LedgerError("Savings account not found");
    }
    tx.update(P.goal(uid, id), { ...patch, updated_at: now() });
  });
}

export async function contributeToGoal(store: Store, uid: string, c: { goalId: string; amount: number; affectsCash: boolean; occurredOn: string; note: string | null; clientRef?: string | null }) {
  if (c.amount === 0) throw new LedgerError("Amount must not be zero");
  const entryId = c.clientRef ?? store.newId();
  return store.transaction(async (tx) => {
    if (await tx.get(P.contribution(uid, entryId))) return "duplicate" as const;
    const g = await tx.get<GoalDoc>(P.goal(uid, c.goalId));
    if (!g || g.deleted_at) throw new LedgerError("Goal not found");
    if (g.savings_account_id) throw new LedgerError("This goal is funded by a linked savings account; add money to that account instead");
    if (g.saved_minor + c.amount < 0) throw new LedgerError("Cannot withdraw more than the amount allocated to this goal");
    const totals = await new Totals(uid).load(tx);
    if (c.affectsCash) totals.cash("goals_net_minor", c.amount);
    const saved = g.saved_minor + c.amount;
    const done = saved >= g.target_amount_minor;
    const status = done ? "completed" : g.status === "completed" || g.status === "not_started" ? "active" : g.status;
    tx.update(P.goal(uid, c.goalId), { saved_minor: saved, status, completed_at: done ? now() : null, updated_at: now() });
    tx.create(P.contribution(uid, entryId), { user_id: uid, goal_id: c.goalId, amount_minor: c.amount, affects_cash: c.affectsCash, occurred_on: c.occurredOn, note: c.note, created_at: now() });
    totals.save(tx);
    return "created" as const;
  });
}

export async function deleteContribution(store: Store, uid: string, entryId: string) {
  await store.transaction(async (tx) => {
    const e = await tx.get<{ goal_id: string; amount_minor: number; affects_cash: boolean }>(P.contribution(uid, entryId));
    if (!e) throw new NotFoundError("Entry not found");
    const g = await tx.get<GoalDoc>(P.goal(uid, e.goal_id));
    const totals = await new Totals(uid).load(tx);
    if (g) {
      if (g.saved_minor - e.amount_minor < 0) throw new LedgerError("Deleting this entry would make the goal allocation negative");
      tx.update(P.goal(uid, e.goal_id), { saved_minor: g.saved_minor - e.amount_minor, updated_at: now() });
    }
    if (e.affects_cash) totals.cash("goals_net_minor", -e.amount_minor);
    tx.delete(P.contribution(uid, entryId));
    totals.save(tx);
  });
}

/** Deletes a goal; money allocated from cash returns to the cash balance. */
export async function deleteGoal(store: Store, uid: string, goalId: string) {
  const entries = await store.list<{ amount_minor: number; affects_cash: boolean }>(userPath(uid, "goal_contributions"), { where: [["goal_id", "==", goalId]] });
  await store.transaction(async (tx) => {
    if (!(await tx.get(P.goal(uid, goalId)))) throw new NotFoundError("Goal not found");
    const totals = await new Totals(uid).load(tx);
    for (const e of entries) {
      if (e.affects_cash) totals.cash("goals_net_minor", -e.amount_minor);
      tx.delete(P.contribution(uid, e.id));
    }
    tx.delete(P.goal(uid, goalId));
    totals.save(tx);
  });
}

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------
interface InvDoc { current_value_minor: number; current_value_as_of: string | null; deleted_at?: string | null }

export async function createInvestment(store: Store, uid: string, data: Record<string, unknown> & { purchase_date: string }, buy: { amount: number; units: number | null; pricePerUnit: number | null; fromCash: boolean }, currentValue: number | null) {
  if (buy.amount <= 0) throw new LedgerError("Amount invested must be positive");
  const id = store.newId();
  await store.transaction(async (tx) => {
    const totals = await new Totals(uid).load(tx);
    const value = currentValue ?? buy.amount;
    tx.create(P.investment(uid, id), { ...data, user_id: uid, current_value_minor: value, current_value_as_of: data.purchase_date, created_at: now(), updated_at: now(), deleted_at: null });
    tx.create(P.investmentTx(uid, store.newId()), { user_id: uid, investment_id: id, type: "buy", amount_minor: buy.amount, units: buy.units, price_per_unit_minor: buy.pricePerUnit, affects_cash: buy.fromCash, occurred_on: data.purchase_date, note: "Initial investment", created_at: now() });
    if (currentValue !== null && currentValue !== buy.amount) tx.create(P.investmentTx(uid, store.newId()), { user_id: uid, investment_id: id, type: "valuation", amount_minor: currentValue, units: null, price_per_unit_minor: null, affects_cash: false, occurred_on: now().slice(0, 10), note: "Current value", created_at: now() });
    if (buy.fromCash) totals.cash("investments_net_minor", buy.amount);
    totals.save(tx);
  });
  return id;
}

export async function addInvestmentTx(store: Store, uid: string, t: { investmentId: string; type: "buy" | "sell" | "valuation"; amount: number; units: number | null; affectsCash: boolean; occurredOn: string; note: string | null; clientRef?: string | null }) {
  if (t.type !== "valuation" && t.amount <= 0) throw new LedgerError("Amount must be greater than zero");
  if (t.amount < 0) throw new LedgerError("Amount cannot be negative");
  const entryId = t.clientRef ?? store.newId();
  return store.transaction(async (tx) => {
    if (await tx.get(P.investmentTx(uid, entryId))) return "duplicate" as const;
    const inv = await tx.get<InvDoc>(P.investment(uid, t.investmentId));
    if (!inv || inv.deleted_at) throw new LedgerError("Investment not found");
    const totals = await new Totals(uid).load(tx);
    const affects = t.type === "valuation" ? false : t.affectsCash;
    const value = t.type === "valuation" ? t.amount : t.type === "buy" ? inv.current_value_minor + t.amount : Math.max(0, inv.current_value_minor - t.amount);
    const asOf = t.type === "valuation" ? t.occurredOn : [inv.current_value_as_of ?? t.occurredOn, t.occurredOn].sort().at(-1);
    if (affects) totals.cash("investments_net_minor", t.type === "buy" ? t.amount : -t.amount);
    tx.update(P.investment(uid, t.investmentId), { current_value_minor: value, current_value_as_of: asOf, updated_at: now() });
    tx.create(P.investmentTx(uid, entryId), { user_id: uid, investment_id: t.investmentId, type: t.type, amount_minor: t.amount, units: t.type === "valuation" ? null : t.units, price_per_unit_minor: null, affects_cash: affects, occurred_on: t.occurredOn, note: t.note, created_at: now() });
    totals.save(tx);
    return "created" as const;
  });
}

export async function deleteInvestmentTx(store: Store, uid: string, entryId: string) {
  const entry = await store.get<{ investment_id: string }>(P.investmentTx(uid, entryId));
  if (!entry) throw new NotFoundError("Entry not found");
  const all = await store.list<{ type: string; amount_minor: number; occurred_on: string; created_at: string }>(userPath(uid, "investment_transactions"), { where: [["investment_id", "==", entry.investment_id]] });
  await store.transaction(async (tx) => {
    const e = await tx.get<{ investment_id: string; type: string; amount_minor: number; affects_cash: boolean }>(P.investmentTx(uid, entryId));
    if (!e) throw new NotFoundError("Entry not found");
    const totals = await new Totals(uid).load(tx);
    if (e.affects_cash) totals.cash("investments_net_minor", e.type === "buy" ? -e.amount_minor : e.amount_minor);
    // Recompute the current value from the remaining history.
    let value = 0;
    for (const r of all.filter((x) => x.id !== entryId).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at))) value = r.type === "valuation" ? r.amount_minor : r.type === "buy" ? value + r.amount_minor : Math.max(0, value - r.amount_minor);
    tx.update(P.investment(uid, e.investment_id), { current_value_minor: value, updated_at: now() });
    tx.delete(P.investmentTx(uid, entryId));
    totals.save(tx);
  });
}

export async function deleteInvestment(store: Store, uid: string, investmentId: string) {
  const entries = await store.list<{ type: string; amount_minor: number; affects_cash: boolean }>(userPath(uid, "investment_transactions"), { where: [["investment_id", "==", investmentId]] });
  await store.transaction(async (tx) => {
    if (!(await tx.get(P.investment(uid, investmentId)))) throw new NotFoundError("Investment not found");
    const totals = await new Totals(uid).load(tx);
    for (const e of entries) {
      if (e.affects_cash) totals.cash("investments_net_minor", e.type === "buy" ? -e.amount_minor : e.amount_minor);
      tx.delete(P.investmentTx(uid, e.id));
    }
    tx.delete(P.investment(uid, investmentId));
    totals.save(tx);
  });
}

// ---------------------------------------------------------------------------
// Debts
// ---------------------------------------------------------------------------
interface DebtDoc { opening_outstanding_minor: number; principal_paid_minor: number; interest_paid_minor: number; payment_count: number; deleted_at?: string | null }

export async function recordDebtPayment(store: Store, uid: string, p: { debtId: string; amount: number; principal: number; interest: number; affectsCash: boolean; paidOn: string; note: string | null; clientRef?: string | null; nextDueDate?: string | null }) {
  if (p.amount <= 0 || p.principal < 0 || p.interest < 0 || p.principal + p.interest !== p.amount) throw new LedgerError("Principal and interest must add up to the payment amount");
  const entryId = p.clientRef ?? store.newId();
  return store.transaction(async (tx) => {
    if (await tx.get(P.debtPayment(uid, entryId))) return { status: "duplicate" as const, paidOff: false };
    const d = await tx.get<DebtDoc>(P.debt(uid, p.debtId));
    if (!d || d.deleted_at) throw new LedgerError("Debt not found");
    const outstanding = d.opening_outstanding_minor - (d.principal_paid_minor ?? 0);
    if (p.principal > outstanding) throw new LedgerError("Principal repaid cannot exceed the outstanding amount");
    const totals = await new Totals(uid).load(tx);
    if (p.affectsCash) totals.cash("debt_payments_minor", p.amount);
    const paidOff = p.principal === outstanding;
    tx.update(P.debt(uid, p.debtId), {
      principal_paid_minor: (d.principal_paid_minor ?? 0) + p.principal,
      interest_paid_minor: (d.interest_paid_minor ?? 0) + p.interest,
      payment_count: (d.payment_count ?? 0) + 1,
      closed_at: paidOff ? now() : null,
      ...(p.nextDueDate !== undefined ? { next_due_date: p.nextDueDate } : {}),
      updated_at: now(),
    });
    tx.create(P.debtPayment(uid, entryId), { user_id: uid, debt_id: p.debtId, amount_minor: p.amount, principal_minor: p.principal, interest_minor: p.interest, affects_cash: p.affectsCash, paid_on: p.paidOn, note: p.note, created_at: now() });
    totals.save(tx);
    return { status: "created" as const, paidOff };
  });
}

export async function deleteDebtPayment(store: Store, uid: string, entryId: string) {
  await store.transaction(async (tx) => {
    const e = await tx.get<{ debt_id: string; amount_minor: number; principal_minor: number; interest_minor: number; affects_cash: boolean }>(P.debtPayment(uid, entryId));
    if (!e) throw new NotFoundError("Payment not found");
    const d = await tx.get<DebtDoc>(P.debt(uid, e.debt_id));
    const totals = await new Totals(uid).load(tx);
    if (d) tx.update(P.debt(uid, e.debt_id), { principal_paid_minor: d.principal_paid_minor - e.principal_minor, interest_paid_minor: d.interest_paid_minor - e.interest_minor, payment_count: Math.max(0, (d.payment_count ?? 1) - 1), closed_at: null, updated_at: now() });
    if (e.affects_cash) totals.cash("debt_payments_minor", -e.amount_minor);
    tx.delete(P.debtPayment(uid, entryId));
    totals.save(tx);
  });
}

export async function deleteDebt(store: Store, uid: string, debtId: string) {
  const entries = await store.list<{ amount_minor: number; affects_cash: boolean }>(userPath(uid, "debt_payments"), { where: [["debt_id", "==", debtId]] });
  await store.transaction(async (tx) => {
    if (!(await tx.get(P.debt(uid, debtId)))) throw new NotFoundError("Debt not found");
    const totals = await new Totals(uid).load(tx);
    for (const e of entries) {
      if (e.affects_cash) totals.cash("debt_payments_minor", -e.amount_minor);
      tx.delete(P.debtPayment(uid, e.id));
    }
    tx.delete(P.debt(uid, debtId));
    totals.save(tx);
  });
}

// ---------------------------------------------------------------------------
// Cash summary
// ---------------------------------------------------------------------------
export async function cashSummary(store: Store, uid: string, openingBalanceMinor: number) {
  const t = { ...ZERO_TOTALS, ...((await store.get<LedgerTotals>(P.ledger(uid))) ?? {}) };
  return {
    opening_balance_minor: openingBalanceMinor,
    income_minor: t.income_minor,
    expense_minor: t.expense_minor,
    savings_net_minor: t.savings_net_minor,
    goals_net_minor: t.goals_net_minor,
    investments_net_minor: t.investments_net_minor,
    debt_payments_minor: t.debt_payments_minor,
    cash_balance_minor: openingBalanceMinor + t.income_minor - t.expense_minor - t.savings_net_minor - t.goals_net_minor - t.investments_net_minor - t.debt_payments_minor,
  };
}
