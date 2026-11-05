# Data model (Firestore)

All money values are **integer minor units** (paise for INR).

```
users/{uid}                         profile, roles[], settings{currency, locale, timezone, …}
  income_categories/{id}  expense_categories/{id}   (parent_id → one subcategory level)
  transactions/{id}                 income/expense; status completed|expected; soft-delete deleted_at
  recurring_transactions/{id}       rules; occurrences become transactions/{ruleId}_{date}
  budgets/{id}
  financial_goals/{id}              saved_minor (direct allocations) or savings_account_id (linked bucket)
  goal_contributions/{id}
  savings_accounts/{id}             balance_minor (running total)
  savings_transactions/{id}         deposit | withdrawal | transfer_in/out ({group}_in / {group}_out)
  investments/{id}  investment_transactions/{id}
  debts/{id}                        principal_paid_minor, interest_paid_minor (running totals)
  debt_payments/{id}
  assets/{id}  liabilities/{id}  financial_snapshots/{yyyy-mm}
  notifications/{hash(dedupe)}  user_achievements/{code}  files/{id}
  meta/ledger                       cash-affecting running totals
  months/{yyyy-mm}                  income/expense totals by category for that month
platform/settings  default_categories/{id}  notification_templates/{key}
audit_logs/{id}  app_errors/{id}  activity/{day}_{uid}  rate_limits/{key}  otp_codes/{hash}
```

## Cash and double counting
Tracked cash = opening balance + received income − expenses − net deposits into savings from cash − net goal allocations from cash − investment buys from cash + sells to cash − debt payments from cash. Each movement carries `affects_cash`, so pre-existing money can be recorded without distorting cash. Transfers between buckets are cash-neutral; expected income is never cash; a bucket backs at most one goal; net worth uses tracked cash **or** manual bank/cash assets, never both.

## Consistency
Every money-moving write is a single Firestore transaction (see `src/server/data/ledger.ts`) that updates the entry, the parent balance and `meta/ledger` / `months/*` together. Tested in `tests/ledger/` against an in-memory store with serialised transactions.

## Indexes
Queries use single-field ranges or equality filters only, so no composite indexes are required (`firestore.indexes.json` is empty).
