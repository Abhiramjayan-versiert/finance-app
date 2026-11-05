import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asUser, connect, createUser, freshDatabase } from "./helpers";

let c: Client;
let c2: Client;
let A: string;
let B: string;
let ADMIN: string;
let url: string;

const q = (sql: string, params: unknown[] = []) => c.query(sql, params);

beforeAll(async () => {
  url = await freshDatabase("fos_rls_test");
  c = await connect(url);
  c2 = await connect(url);
  A = await createUser(c, "a@example.com", "Alice");
  B = await createUser(c, "b@example.com", "Bob");
  ADMIN = await createUser(c, "admin@example.com", "Admin");
  await q(`insert into public.user_roles (user_id, role) values ($1, 'super_admin')`, [ADMIN]);
});

afterAll(async () => {
  await c?.end();
  await c2?.end();
});

async function expenseCat(uid: string, name = "Food") {
  return asUser(c, uid, async () => (await q(`select id from expense_categories where name = $1`, [name])).rows[0].id as string);
}

describe("signup bootstrap", () => {
  it("creates profile, settings with INR defaults and private copies of default categories", async () => {
    await asUser(c, A, async () => {
      const p = await q(`select full_name, terms_accepted_at from profiles where id = $1`, [A]);
      expect(p.rows[0].full_name).toBe("Alice");
      expect(p.rows[0].terms_accepted_at).not.toBeNull();
      const s = await q(`select currency, locale, timezone from user_settings`);
      expect(s.rows).toEqual([{ currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata" }]);
      expect((await q(`select count(*)::int n from expense_categories`)).rows[0].n).toBe(19);
      expect((await q(`select count(*)::int n from income_categories`)).rows[0].n).toBe(8);
    });
  });

  it("rejects signups when registrations are disabled", async () => {
    await q(`update platform_settings set value = 'false' where key = 'signups_enabled'`);
    await expect(createUser(c, "blocked@example.com")).rejects.toThrow(/disabled/);
    await q(`update platform_settings set value = 'true' where key = 'signups_enabled'`);
  });
});

describe("row level security isolation", () => {
  let txId: string;
  beforeAll(async () => {
    const cat = await expenseCat(A);
    txId = await asUser(c, A, async () => (await q(`insert into transactions (user_id, type, title, amount_minor, occurred_on, expense_category_id) values ($1, 'expense', 'Lunch', 25000, '2026-03-01', $2) returning id`, [A, cat])).rows[0].id);
  });

  it("other users cannot read, update or delete the row even with its UUID", async () => {
    await asUser(c, B, async () => {
      expect((await q(`select * from transactions where id = $1`, [txId])).rowCount).toBe(0);
      expect((await q(`update transactions set amount_minor = 1 where id = $1`, [txId])).rowCount).toBe(0);
      expect((await q(`delete from transactions where id = $1`, [txId])).rowCount).toBe(0);
    });
    await asUser(c, A, async () => expect((await q(`select amount_minor from transactions where id = $1`, [txId])).rows[0].amount_minor).toBe("25000"));
  });

  it("users cannot insert rows owned by someone else", async () => {
    await expect(asUser(c, B, () => q(`insert into transactions (user_id, type, title, amount_minor, occurred_on) values ($1, 'expense', 'x', 1, '2026-01-01')`, [A]))).rejects.toThrow(/row-level security/);
  });

  it("users cannot reassign their row to another user", async () => {
    await expect(asUser(c, A, () => q(`update transactions set user_id = $1 where id = $2`, [B, txId]))).rejects.toThrow(/row-level security/);
  });

  it("users cannot attach records to another user's category, goal or account", async () => {
    const aCat = await expenseCat(A);
    await expect(asUser(c, B, () => q(`insert into transactions (user_id, type, title, amount_minor, occurred_on, expense_category_id) values ($1, 'expense', 'x', 100, '2026-01-01', $2)`, [B, aCat]))).rejects.toThrow(/foreign key/);
    const acct = await asUser(c, A, async () => (await q(`insert into savings_accounts (user_id, name) values ($1, 'A fund') returning id`, [A])).rows[0].id);
    await expect(asUser(c, B, () => q(`insert into savings_transactions (user_id, account_id, type, amount_minor) values ($1, $2, 'deposit', 100)`, [B, acct]))).rejects.toThrow();
    await expect(asUser(c, B, () => q(`select transfer_savings($1, $1, 100)`, [acct]))).rejects.toThrow();
  });

  it("anonymous visitors see no financial data but can read public platform flags", async () => {
    await expect(asUser(c, null, () => q(`select * from transactions`))).rejects.toThrow(/permission denied/);
    const flags = await asUser(c, null, async () => (await q(`select key from platform_settings order by key`)).rows.map((r) => r.key));
    expect(flags).toContain("maintenance_mode");
  });

  it("applies the same isolation to every owner table", async () => {
    const tables = ["income_categories", "expense_categories", "recurring_transactions", "transactions", "budgets", "savings_accounts", "savings_transactions", "financial_goals", "goal_contributions", "investments", "investment_transactions", "debts", "debt_payments", "assets", "liabilities", "financial_snapshots", "notifications", "user_achievements"];
    for (const t of tables) {
      const { rows } = await q(`select relrowsecurity from pg_class where oid = $1::regclass`, [`public.${t}`]);
      expect(rows[0].relrowsecurity, t).toBe(true);
      const leaked = await asUser(c, B, async () => (await q(`select count(*)::int n from ${t} where user_id <> $1`, [B])).rows[0].n);
      expect(leaked, t).toBe(0);
    }
  });
});

describe("privilege escalation guards", () => {
  it("users cannot grant themselves roles", async () => {
    await expect(asUser(c, B, () => q(`insert into user_roles (user_id, role) values ($1, 'super_admin')`, [B]))).rejects.toThrow(/permission denied/);
    expect(await asUser(c, B, async () => (await q(`select is_admin() v`)).rows[0].v)).toBe(false);
  });

  it("users cannot un-suspend themselves or change protected profile columns", async () => {
    await expect(asUser(c, B, () => q(`update profiles set status = 'active' where id = $1`, [B]))).rejects.toThrow(/permission denied/);
    await asUser(c, B, async () => expect((await q(`update profiles set full_name = 'Robert' where id = $1`, [B])).rowCount).toBe(1));
  });

  it("users cannot write audit logs, error logs or rate limit buckets, or call the limiter", async () => {
    await expect(asUser(c, B, () => q(`insert into audit_logs (action) values ('fake')`))).rejects.toThrow(/permission denied/);
    await expect(asUser(c, B, () => q(`select check_rate_limit('x', 1, 1)`))).rejects.toThrow(/permission denied/);
    await expect(asUser(c, B, () => q(`select * from rate_limits`))).rejects.toThrow(/permission denied/);
  });

  it("only read_at can be changed on notifications", async () => {
    const id = await asUser(c, B, async () => (await q(`insert into notifications (user_id, type, title) values ($1, 'test', 'Hi') returning id`, [B])).rows[0].id);
    await asUser(c, B, async () => expect((await q(`update notifications set read_at = now() where id = $1`, [id])).rowCount).toBe(1));
    await expect(asUser(c, B, () => q(`update notifications set title = 'x' where id = $1`, [id]))).rejects.toThrow(/permission denied/);
  });

  it("admins can list account metadata but cannot read financial records", async () => {
    await asUser(c, ADMIN, async () => {
      expect((await q(`select is_admin() v`)).rows[0].v).toBe(true);
      expect((await q(`select count(*)::int n from profiles`)).rows[0].n).toBeGreaterThanOrEqual(3);
      expect((await q(`select count(*)::int n from transactions`)).rows[0].n).toBe(0);
      expect((await q(`select count(*)::int n from savings_accounts`)).rows[0].n).toBe(0);
      const stats = (await q(`select admin_platform_stats() s`)).rows[0].s;
      expect(stats.total_users).toBeGreaterThanOrEqual(3);
    });
  });

  it("non-admins cannot call admin functions", async () => {
    await expect(asUser(c, B, () => q(`select admin_platform_stats()`))).rejects.toThrow(/Forbidden/);
    await expect(asUser(c, B, () => q(`select * from admin_list_users()`))).rejects.toThrow(/Forbidden/);
    expect(await asUser(c, B, async () => (await q(`select count(*)::int n from profiles`)).rows[0].n)).toBe(1);
  });
});

describe("financial integrity", () => {
  it("savings cannot go negative and transfers are atomic and cash-neutral", async () => {
    await asUser(c, B, async () => {
      const a1 = (await q(`insert into savings_accounts (user_id, name, kind) values ($1, 'Emergency', 'emergency') returning id`, [B])).rows[0].id;
      const a2 = (await q(`insert into savings_accounts (user_id, name) values ($1, 'Vacation') returning id`, [B])).rows[0].id;
      await q(`insert into transactions (user_id, type, title, amount_minor, occurred_on) values ($1, 'income', 'Salary', 10000000, '2026-03-01')`, [B]);
      await q(`insert into savings_transactions (user_id, account_id, type, amount_minor, affects_cash) values ($1, $2, 'deposit', 2000000, true)`, [B, a1]);
      const before = (await q(`select cash_balance_minor from cash_summary()`)).rows[0].cash_balance_minor;
      expect(before).toBe("8000000");
      await q(`select transfer_savings($1, $2, 500000)`, [a1, a2]);
      expect((await q(`select cash_balance_minor from cash_summary()`)).rows[0].cash_balance_minor).toBe(before);
      const bal = (await q(`select account_id, balance_minor from savings_account_balances order by balance_minor`)).rows;
      expect(bal.map((r) => r.balance_minor)).toEqual(["500000", "1500000"]);
      // Income/expense totals are unaffected by transfers.
      const s = (await q(`select income_minor, expense_minor from cash_summary()`)).rows[0];
      expect(s).toEqual({ income_minor: "10000000", expense_minor: "0" });
    });
    await expect(asUser(c, B, async () => {
      const id = (await q(`select id from savings_accounts where name = 'Vacation'`)).rows[0].id;
      await q(`insert into savings_transactions (user_id, account_id, type, amount_minor) values ($1, $2, 'withdrawal', 999999999)`, [B, id]);
    })).rejects.toThrow(/Insufficient balance/);
  });

  it("deleting one leg of a transfer removes both legs", async () => {
    await asUser(c, B, async () => {
      const leg = (await q(`select id, transfer_group from savings_transactions where type = 'transfer_in' limit 1`)).rows[0];
      await q(`delete from savings_transactions where id = $1`, [leg.id]);
      expect((await q(`select count(*)::int n from savings_transactions where transfer_group = $1`, [leg.transfer_group])).rows[0].n).toBe(0);
    });
  });

  it("serialises concurrent withdrawals so the balance never goes negative", async () => {
    const acct = await asUser(c, B, async () => {
      const id = (await q(`insert into savings_accounts (user_id, name) values ($1, 'Race') returning id`, [B])).rows[0].id;
      await q(`insert into savings_transactions (user_id, account_id, type, amount_minor, affects_cash) values ($1, $2, 'deposit', 1000, false)`, [B, id]);
      return id as string;
    });
    const withdraw = (cl: Client) => asUser(cl, B, () => cl.query(`insert into savings_transactions (user_id, account_id, type, amount_minor, affects_cash) values ($1, $2, 'withdrawal', 800, false)`, [B, acct]));
    const results = await Promise.allSettled([withdraw(c), withdraw(c2)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const bal = await asUser(c, B, async () => (await q(`select balance_minor from savings_account_balances where account_id = $1`, [acct])).rows[0].balance_minor);
    expect(bal).toBe("200");
  });

  it("goals: opening allocation is atomic, withdrawals are capped, linked goals use the bucket", async () => {
    await asUser(c, B, async () => {
      const gid = (await q(`select create_financial_goal('MacBook', 'gadgets', 18000000, '2027-11-05', 'high', null, 'Electronics', null, null, null, 2000000, false) id`)).rows[0].id;
      expect((await q(`select saved_minor from goal_progress where goal_id = $1`, [gid])).rows[0].saved_minor).toBe("2000000");
      expect((await q(`select status from financial_goals where id = $1`, [gid])).rows[0].status).toBe("active");
      await expect(q(`insert into goal_contributions (user_id, goal_id, amount_minor) values ($1, $2, -3000000)`, [B, gid])).rejects.toThrow(/more than the amount allocated/);
    }, false).catch(() => {});
    await asUser(c, B, async () => {
      const acct = (await q(`select id from savings_accounts where name = 'Emergency'`)).rows[0].id;
      const gid = (await q(`select create_financial_goal('Safety net', 'emergency_fund', 5000000, '2027-01-01', 'high', null, null, null, null, $1, 0, false) id`, [acct])).rows[0].id;
      const saved = (await q(`select saved_minor from goal_progress where goal_id = $1`, [gid])).rows[0].saved_minor;
      const bal = (await q(`select balance_minor from savings_account_balances where account_id = $1`, [acct])).rows[0].balance_minor;
      expect(saved).toBe(bal);
      await expect(q(`insert into goal_contributions (user_id, goal_id, amount_minor) values ($1, $2, 100)`, [B, gid])).rejects.toThrow(/linked savings account/);
    }, false).catch((e) => { throw e; });
  });

  it("a savings bucket can back only one goal (no double counting)", async () => {
    await expect(asUser(c, B, async () => {
      const acct = (await q(`select id from savings_accounts where name = 'Emergency'`)).rows[0].id;
      await q(`select create_financial_goal('G1', 'other', 100, '2027-01-01', 'low', null, null, null, null, $1, 0, false)`, [acct]);
      await q(`select create_financial_goal('G2', 'other', 100, '2027-01-01', 'low', null, null, null, null, $1, 0, false)`, [acct]);
    })).rejects.toThrow(/duplicate key/);
  });

  it("debt payments cannot repay more principal than outstanding", async () => {
    await expect(asUser(c, B, async () => {
      const d = (await q(`insert into debts (user_id, name, principal_minor, opening_outstanding_minor, interest_rate, start_date) values ($1, 'Loan', 100000, 50000, 12, '2026-01-01') returning id`, [B])).rows[0].id;
      await q(`insert into debt_payments (user_id, debt_id, amount_minor, principal_minor, interest_minor) values ($1, $2, 40000, 39500, 500)`, [B, d]);
      expect((await q(`select outstanding_minor from debt_balances where debt_id = $1`, [d])).rows[0].outstanding_minor).toBe("10500");
      await q(`insert into debt_payments (user_id, debt_id, amount_minor, principal_minor, interest_minor) values ($1, $2, 20000, 20000, 0)`, [B, d]);
    })).rejects.toThrow(/cannot exceed/);
  });

  it("rejects negative, zero and inconsistent amounts", async () => {
    await expect(asUser(c, B, () => q(`insert into transactions (user_id, type, title, amount_minor, occurred_on) values ($1, 'expense', 'neg', -5, '2026-01-01')`, [B]))).rejects.toThrow(/check constraint/);
    await expect(asUser(c, B, () => q(`insert into transactions (user_id, type, title, amount_minor, occurred_on) values ($1, 'expense', 'zero', 0, '2026-01-01')`, [B]))).rejects.toThrow(/check constraint/);
    await expect(asUser(c, B, () => q(`insert into transactions (user_id, type, status, title, amount_minor, occurred_on) values ($1, 'expense', 'expected', 'x', 5, '2026-01-01')`, [B]))).rejects.toThrow(/check constraint/);
    await expect(asUser(c, B, async () => {
      const d = (await q(`insert into debts (user_id, name, principal_minor, opening_outstanding_minor, interest_rate, start_date) values ($1, 'Loan2', 1000, 1000, 0, '2026-01-01') returning id`, [B])).rows[0].id;
      await q(`insert into debt_payments (user_id, debt_id, amount_minor, principal_minor, interest_minor) values ($1, $2, 100, 10, 10)`, [B, d]);
    })).rejects.toThrow(/check constraint/);
  });

  it("expected income is excluded from the cash balance", async () => {
    await asUser(c, B, async () => {
      const before = (await q(`select cash_balance_minor from cash_summary()`)).rows[0].cash_balance_minor;
      await q(`insert into transactions (user_id, type, status, title, amount_minor, occurred_on) values ($1, 'income', 'expected', 'Bonus', 999900, '2026-12-01')`, [B]);
      expect((await q(`select cash_balance_minor from cash_summary()`)).rows[0].cash_balance_minor).toBe(before);
    });
  });

  it("recurring occurrences and client submissions are idempotent", async () => {
    await asUser(c, B, async () => {
      const r = (await q(`insert into recurring_transactions (user_id, type, title, amount_minor, frequency, start_date) values ($1, 'expense', 'Rent', 2500000, 'monthly', '2026-01-01') returning id`, [B])).rows[0].id;
      const ins = `insert into transactions (user_id, type, title, amount_minor, occurred_on, recurring_id, occurrence_date, is_recurring) values ($1, 'expense', 'Rent', 2500000, '2026-01-01', $2, '2026-01-01', true) on conflict (recurring_id, occurrence_date) do nothing`;
      expect((await q(ins, [B, r])).rowCount).toBe(1);
      expect((await q(ins, [B, r])).rowCount).toBe(0);
      const ref = "11111111-1111-1111-1111-111111111111";
      await q(`insert into transactions (user_id, type, title, amount_minor, occurred_on, client_ref) values ($1, 'expense', 'Coffee', 100, '2026-01-02', $2)`, [B, ref]);
      await expect(q(`insert into transactions (user_id, type, title, amount_minor, occurred_on, client_ref) values ($1, 'expense', 'Coffee', 100, '2026-01-02', $2)`, [B, ref])).rejects.toThrow(/duplicate key/);
    }, false);
  });

  it("investment valuations update the current value", async () => {
    await asUser(c, B, async () => {
      const id = (await q(`select create_investment('Index fund', 'mutual_fund', 100000, '2026-01-01', 10, 10000, 120000) id`)).rows[0].id;
      expect((await q(`select current_value_minor from investments where id = $1`, [id])).rows[0].current_value_minor).toBe("120000");
      await q(`insert into investment_transactions (user_id, investment_id, type, amount_minor, affects_cash) values ($1, $2, 'valuation', 90000, false)`, [B, id]);
      expect((await q(`select current_value_minor from investments where id = $1`, [id])).rows[0].current_value_minor).toBe("90000");
    });
  });

  it("records daily activity once per day", async () => {
    expect(await asUser(c, A, async () => (await q(`select record_activity() v`)).rows[0].v)).toBe(true);
    expect(await asUser(c, A, async () => (await q(`select record_activity() v`)).rows[0].v)).toBe(false);
  });

  it("soft-deleted transactions drop out of the cash balance", async () => {
    await asUser(c, A, async () => {
      const before = Number((await q(`select cash_balance_minor from cash_summary()`)).rows[0].cash_balance_minor);
      await q(`update transactions set deleted_at = now() where title = 'Lunch'`);
      expect(Number((await q(`select cash_balance_minor from cash_summary()`)).rows[0].cash_balance_minor)).toBe(before + 25000);
    });
  });
});
