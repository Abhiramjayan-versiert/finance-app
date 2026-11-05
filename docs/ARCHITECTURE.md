# Architecture decisions

1. **Server-first Next.js App Router.** Pages are Server Components that read via the user-scoped Supabase client (RLS enforced). Mutations are Server Actions with Zod validation; client components are limited to forms, dialogs and charts.
2. **Defence in depth.** The proxy handles coarse routing (unauthenticated → login, unverified → verify). `requireWorkspace()` re-checks auth, verification and suspension on every render; RLS makes the database the final authority.
3. **One calculation engine.** All maths lives in `src/lib/finance/*` (pure TypeScript, unit tested) and is reused by pages, reports, the goal form's live preview, notifications and the cron job. No calculation is duplicated in components.
4. **Integer minor units + decimal.js.** Avoids floating point errors; formatting uses `Intl.NumberFormat` (en-IN lakh grouping by default).
5. **Ledger + derived balances.** Balances are computed from immutable entries (views/RPCs) rather than stored counters, so they cannot drift; DB triggers enforce invariants under concurrency.
6. **Maintenance on read + daily cron.** On the first visit each day the app catches up recurring transactions and refreshes notifications, achievements and the net-worth snapshot for that user; Vercel Cron does the same for all users and sends opt-in emails. Both paths are idempotent.
7. **Admin privacy.** Admin tooling is built on aggregate/metadata-only database functions; no policy lets admins read financial tables. Privileged writes use the service role only after a server-side role check and are audited.
8. **PWA without data caching.** The service worker caches only static assets; offline capture is an explicit, user-scoped IndexedDB queue replayed through authenticated, idempotent actions.
9. **Extensibility.** `investments.market_data_ref` reserves space for market-data integrations; the PWA can be wrapped with Capacitor for store distribution; `logServerError` is the hook for Sentry.
