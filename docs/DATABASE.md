# Database

PostgreSQL (Supabase). Migrations: `supabase/migrations/` (apply in order).

| File | Contents |
|---|---|
| `…0001_core_schema.sql` | Tables, enums, constraints, indexes, `updated_at` triggers |
| `…0002_security_and_functions.sql` | Role helpers, signup trigger, integrity triggers, RPCs, views, **RLS policies**, grants, storage buckets/policies |
| `…0003_reference_data.sql` | Default categories, achievements, notification templates, platform settings (idempotent) |
| `…0004_admin_functions.sql` | `admin_list_users()` |

## Tables
Identity: `profiles`, `user_roles`, `user_settings` · Categories: `default_categories`, `income_categories`, `expense_categories` (one subcategory level) · Ledger: `transactions`, `recurring_transactions` · Planning: `budgets`, `financial_goals`, `goal_contributions` · Savings: `savings_accounts`, `savings_transactions` · Investing: `investments`, `investment_transactions` · Debt: `debts`, `debt_payments` · Net worth: `assets`, `liabilities`, `financial_snapshots` · Engagement: `notifications`, `notification_templates`, `achievements`, `user_achievements` · Platform: `audit_logs`, `platform_settings`, `app_errors`, `user_activity`, `rate_limits`.

All primary keys are UUIDs; user-owned tables have `user_id`, `created_at`, `updated_at` and (where deletion should be recoverable) `deleted_at`.

## Money model
- All amounts are `bigint` **minor units** (paise for INR) via the `money_minor` domain (bounded to keep JS numbers exact). Arithmetic in TypeScript uses integers and decimal.js — never floats.
- Each workspace has a base currency (`user_settings.currency`); records also store `currency` for future multi-currency support.

## Avoiding double counting
Money lives in exactly one pool at a time:

| Pool | Source of truth |
|---|---|
| Tracked cash | `cash_summary()` = opening balance + received income − expenses − net savings deposits from cash − net goal allocations from cash − investment buys from cash + sells to cash − debt payments from cash |
| Savings buckets | `savings_account_balances` |
| Goal allocations | `goal_contributions` (goals linked to a bucket use the bucket balance instead and cannot hold allocations; one bucket backs at most one goal) |
| Investments | `investments.current_value_minor` (kept in sync by `apply_investment_transaction`) |
| Debts | `debt_balances` (opening outstanding − principal repaid) |

Rules: expected income is never cash; transfers between buckets are cash-neutral (`affects_cash = false` enforced by a CHECK); savings/goal movements are never income or expenses; each movement has an `affects_cash` flag so pre-existing money can be recorded without distorting cash. Net worth uses either tracked cash **or** manual cash/bank assets (`user_settings.net_worth_cash_source`), never both.

## Integrity & concurrency
- Triggers lock the parent row (`SELECT … FOR UPDATE`) before checking balances, serialising concurrent withdrawals/payments (tested with two connections).
- Ledger rows (`savings_transactions`, `goal_contributions`, `investment_transactions`, `debt_payments`) are immutable; corrections are delete + re-create, with post-delete checks that balances stay non-negative. Deleting one leg of a transfer deletes both.
- Multi-row operations run in single database functions: `transfer_savings`, `create_financial_goal`, `create_investment`.
- Idempotency: `UNIQUE (recurring_id, occurrence_date)` for recurring generation; `UNIQUE (user_id, client_ref)` for client submissions and offline replays; `UNIQUE (user_id, dedupe_key)` for notifications; one snapshot per user per month.

## Testing locally
```bash
# any PostgreSQL 15+ superuser connection
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:db
```
`tests/db/supabase-stub.sql` emulates the Supabase roles and `auth.uid()` so migrations and RLS run on plain Postgres.
