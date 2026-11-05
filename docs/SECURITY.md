# Security

## Architecture in one paragraph
Browsers never talk to the database. Every read and write goes through the Next.js server using the Firebase Admin SDK, and every path is built from the uid in the **verified session cookie** (`users/{uid}/…`). Firestore security rules deny all client access, so there is no client-rule surface to misconfigure. Financial invariants (no overdrafts, capped withdrawals/repayments, cash-neutral transfers) are enforced inside Firestore transactions.

## Authentication & sessions
- Firebase Authentication (email + password). Passwords are sent only server → Google (Identity Toolkit REST); the app never stores them.
- Sessions are **httpOnly, SameSite=Lax, Secure** Firebase session cookies (5 days), verified on every request with `verifySessionCookie(cookie, checkRevoked = true)` — revoked, disabled or expired sessions are rejected.
- Email verification is required before any financial page or action: 6-digit codes (HMAC-stored, 10-minute expiry, 5 attempts, single use) when Resend is configured, otherwise Firebase verification links.
- Password change requires the current password and revokes all other sessions; password reset never reveals whether an email is registered.
- Suspension disables the Firebase user and revokes refresh tokens, ending live sessions immediately (covered by E2E tests).
- Account deletion requires typing `DELETE` + the password and removes every document under `users/{uid}` plus the auth user.

## Authorization & data isolation
- All user data lives under `users/{uid}`; the uid is never taken from client input. Cross-user references (e.g. a category id) are resolved under the caller's own path, so another user's ids simply don't exist.
- Roles (`super_admin`, `admin`, `support`) are stored on the user document and can only be changed server-side by a super admin (or the CLI script). `requireAdmin()` re-checks on every admin render and action.
- **Admins cannot read financial records.** Admin views use account metadata and aggregate counts only, and every privileged action writes to `audit_logs` (actor, action, target, metadata, IP). Safeguards: no self-suspension, super admins can't be suspended, deletion needs the user's email typed, the last super admin can't revoke themselves.

## Integrity
- Money is integer minor units with decimal.js parsing — no floating point.
- Ledger operations run in Firestore transactions that read every dependent document, validate, then write entries and running totals together; conflicting transactions are retried, so concurrent withdrawals can't both succeed (tested).
- Writes are idempotent (`client_ref` document ids, `${rule}_${date}` for recurring occurrences, hashed dedupe keys for notifications).

## Input validation, errors, rate limits
- Every server action and API route validates with Zod. Uploaded files are type-checked by magic bytes (not the browser's claim) and size-limited.
- Users get generic error messages; details go to `app_errors` (Admin → System health) and server logs.
- Firestore-backed fixed-window rate limits (hashed keys) on register, login, verification, resend, password reset/change, account deletion, writes, uploads and exports.

## Transport & headers
CSP (`connect-src 'self'`, `frame-ancestors 'none'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive Permissions-Policy, COOP; authenticated pages are `Cache-Control: private, no-store`. Server Actions use Next.js origin checks; the cron endpoint requires a constant-time-compared bearer secret.

## Exports, PWA, secrets
- CSV export neutralises spreadsheet formula injection.
- The service worker caches only static assets and the offline page — never HTML, API or data responses. Offline entries are kept in IndexedDB per user, replayed through authenticated idempotent actions, and cleared on sign-out.
- All Firebase credentials are server-only environment variables (`server-only` import guards); nothing secret is shipped to the browser. `.env*` is git-ignored.

## Test-only fake backend
`FINANCE_OS_FAKE_BACKEND=1` swaps in an in-memory store and fake auth for automated E2E tests. It is ignored whenever `VERCEL` is set, so it cannot activate in a deployment, and its helper route (`/api/test/outbox`) returns 404 otherwise.

## What we never store
Bank passwords, card numbers, CVVs or bank OTPs.
