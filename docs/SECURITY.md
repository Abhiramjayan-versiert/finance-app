# Security

## Threat model in one paragraph
Financial records are highly confidential. The primary risks are cross-tenant data access, privilege escalation, credential abuse and data leakage through caches or logs. FINANCE OS defends in depth: the database enforces ownership regardless of what the application does, the server re-validates every input and permission, and the browser never holds privileged keys.

## Data isolation (Row Level Security)
- RLS is enabled on **every** table in `public`. All 18 user-owned financial tables share one policy set: `user_id = auth.uid()` for select/insert/update/delete.
- Cross-row references use **composite foreign keys `(id, user_id)`**, so a user cannot attach their transaction to someone else's category, goal, savings account, investment or debt even with a guessed UUID.
- Column privileges restrict what users may update: profiles (`full_name`, `avatar_url`, `country`, `onboarded_at` only — not `status`), notifications (`read_at` only), user_achievements (no updates).
- `anon` has no access to any table except public platform flags.
- Views (`savings_account_balances`, `goal_progress`, `debt_balances`) use `security_invoker = true`; RPCs that write data (`transfer_savings`, `create_financial_goal`, `create_investment`, `cash_summary`) are `SECURITY INVOKER`, so RLS still applies.
- Verified by `tests/db/rls.test.ts` (isolation per table, insert/update spoofing, FK spoofing, role self-grant, suspended-status tampering, admin cannot read finances, concurrency).

## Administration & privacy
- Roles live in `user_roles`, which clients cannot write. `is_admin()` / `has_role()` are `SECURITY DEFINER` with a fixed `search_path`.
- **Admins cannot read financial records.** No RLS policy grants admins access to financial tables. The admin console uses `admin_platform_stats()` (aggregate counts) and `admin_list_users()` (account metadata only), both of which check `is_admin()` in the database.
- Every admin page and action calls `requireAdmin()` on the server. Mutations (suspend, reactivate, delete, role changes, platform settings, templates, default categories) use the service role **only after** that check, and each writes an `audit_logs` entry (actor, action, target, metadata, IP).
- Safeguards: admins cannot suspend themselves or super admins; deletion requires super admin + typing the user's email; the last super admin cannot revoke their own role.
- The first super admin is created only server-side (CLI script or SQL) — see DEPLOYMENT.md §10.

## Authentication
- Supabase Auth with email + password; **email confirmation required** (6-digit OTP, expiry configured in Supabase). Unverified users are redirected to `/verify` by the proxy and by `requireWorkspace()`.
- Sessions are httpOnly cookies managed by `@supabase/ssr`; the proxy refreshes them on each request and the server always validates with `auth.getUser()` (never trusts the cookie payload alone).
- Suspension sets `profiles.status = 'suspended'` **and** bans the auth user, blocking sign-in and token refresh.
- Password recovery uses a one-time code; responses never reveal whether an email is registered.
- Account deletion requires typing `DELETE` and re-entering the password; files in storage are removed and the database cascades.

## Input validation & errors
- Every server action and API route validates input with Zod (`src/lib/validation`), including money parsing via decimal.js into integer minor units, date validity (leap years), enums and length limits.
- Database CHECK constraints and triggers enforce invariants independently (positive amounts, savings never negative, goal withdrawals capped, principal never over-repaid, immutable ledger rows, single-level subcategories).
- Errors returned to users are generic; Postgres error codes are mapped to safe messages. Details go to `app_errors` / server logs only.

## Rate limiting
Database-backed fixed windows (`check_rate_limit`, service-role only; keys are SHA-256 hashed) on register, login, OTP verify/resend, password reset, password change, account deletion, transaction writes and exports. Supabase Auth's own limits apply as well.

## CSRF, headers & transport
- Server Actions are POST-only with Next.js origin checks; API routes that change state don't exist outside server actions except the cron endpoint, which requires a constant-time-compared bearer secret.
- Headers on every response: CSP (`frame-ancestors 'none'`, restricted `connect-src` to self + Supabase), HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive Permissions-Policy, COOP. Authenticated routes send `Cache-Control: private, no-store`.

## Files
- Private buckets (`receipts`, `avatars`, `goal-images`) with size and MIME limits; storage policies require the first path segment to equal `auth.uid()`. Files are served via short-lived signed URLs. Server actions reject paths outside the caller's folder.

## Exports
- CSV cells starting with `= + - @` are prefixed to prevent spreadsheet formula injection. Export routes are authenticated, rate limited and `no-store`.

## PWA / offline
- The service worker caches only hashed static assets, icons and the offline page — never HTML, API, RSC or Supabase responses.
- Offline entries are stored in IndexedDB scoped to the user id, replayed through the authenticated server action (re-validated, de-duplicated by `client_ref`) and cleared on sign-out.

## What we never store
Banking passwords, card numbers, CVVs or OTPs. The OTP lifecycle is handled entirely by Supabase Auth.

## Secrets
- Only `NEXT_PUBLIC_*` values reach the browser. The service-role key is read in `src/lib/env.server.ts`, which imports `server-only` so a client import fails the build.
- `.env*` files are git-ignored; `.env.example` contains names only.

## Reporting
Report vulnerabilities privately to the maintainers; do not open public issues for security problems.
