# Architecture decisions

1. **Standalone Firebase backend.** Firebase Auth + Firestore on the free Spark plan; no paid storage bucket (files ≤700 KB are stored as private Firestore documents).
2. **Server-only data access.** The browser never uses a Firebase SDK. Server Components and Server Actions use the Admin SDK scoped to the session's uid; Firestore rules deny all client access.
3. **One calculation engine.** `src/lib/finance/*` (pure, unit tested) powers pages, reports, live form previews, notifications and cron.
4. **Ledger with running totals.** Transactions keep balances and monthly rollups consistent, keeping dashboards cheap (~20 reads) and invariants enforced under concurrency.
5. **Store abstraction.** `src/lib/firebase/store.ts` with Firestore and in-memory implementations; the latter backs ledger tests and the E2E fake backend.
6. **Maintenance on read + daily cron**, both idempotent.
7. **PWA without data caching**; explicit offline queue for new entries.
8. **Extensibility:** `market_data_ref` for future price feeds, Capacitor for store apps, `logServerError` for Sentry.
