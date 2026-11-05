# FINANCE OS

**Your Money. Your Goals. Your Future.**

A free, multi-user personal finance platform: expense & income tracking, budgets, a goal/purchase planner, savings buckets, an investment tracker, debt & EMI management, net worth, 12 calculators, reports with CSV/Excel/PDF export, achievements, notifications, a privacy-preserving super-admin console and an installable PWA.

Built with Next.js 16 (App Router) · TypeScript · **Firebase** (Authentication + Firestore, via the Admin SDK on the server) · Tailwind CSS 4 · shadcn-style components on Radix · Recharts · Lucide · Zod. Deployed on Vercel as its own project.

**Live:** https://finance-os-versiert-solutions.vercel.app (finish the Firebase setup in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) to enable sign-up).

> FINANCE OS is a planning and tracking tool. It is not a bank or brokerage, does not connect to financial institutions, and never stores banking passwords, OTPs or card numbers.

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # fill in your Firebase values (see docs/DEPLOYMENT.md)
npm run dev
```

Register an account, verify your email, and you're in. To make yourself super admin:

```bash
npm run admin:grant -- you@example.com
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit + ledger tests: money, goals, budgets, EMI, investments, calculators, net worth, recurrence, analytics, insights, achievements, exports, validation, and the Firestore ledger (isolation, overdrafts, concurrency, idempotency) |
| `npm run test:e2e` | Playwright: public pages on desktop/mobile/tablet plus the full signed-in journey against an in-memory fake backend (run `npm run build` first) |
| `npm run icons` | Regenerates PNG app icons from `public/icons/icon.svg` |
| `npm run admin:grant -- <email>` | Grants `super_admin` to a verified account (server-side, service role) |

## Project structure

```
src/
  app/
    (marketing)/          landing, terms, privacy, public calculators
    (auth)/               login, register, verify (OTP), forgot/reset password
    (app)/                authenticated workspace: dashboard, transactions, income, expenses,
                          budgets, goals, savings, investments, debts, net-worth, calculators,
                          reports, achievements, notifications, settings
    admin/                super admin console (overview, users, activity, analytics, health, audit, settings)
    api/                  export (CSV/XLSX/JSON), files, cron/daily, health
  components/             ui primitives, layout, charts, forms and per-module components
  lib/
    finance/              pure, tested calculation modules (money, goals, budgets, debt, investments,
                          calculators, net worth, recurrence, analytics, insights, achievements, dates)
    validation/           Zod schemas
    security/             action helpers, rate limiting, audit log, error logging
    firebase/             Admin SDK, store abstraction (Firestore + in-memory), sessions, OTP, test fake
    export/               CSV and XLSX writers
    offline/              IndexedDB queue for offline entries
  server/
    actions/              server actions (all inputs validated with Zod, every write scoped to users/{uid})
    data/ledger.ts        transactional money-moving writes + running totals
    queries/              data loaders (session-scoped)
    maintenance.ts        recurring materialisation, notifications, achievements, snapshots
    reports.ts            report builder shared by the Reports page and export API
  proxy.ts                route gating (Next.js 16 "proxy")
firestore.rules           deny-all client rules
tests/unit, tests/ledger, e2e/
docs/                     DEPLOYMENT, SECURITY, DATABASE, ARCHITECTURE
```

## Documentation

- [Deployment guide](docs/DEPLOYMENT.md) — Firebase project, Vercel env vars, email modes, domain, first super admin
- [Data model](docs/DATABASE.md) — Firestore layout, money model, double-counting rules
- [Security](docs/SECURITY.md) — server-only data access, sessions, admin privacy model, headers, rate limits
- [Architecture](docs/ARCHITECTURE.md) — key decisions

## Integrations requiring credentials

| Integration | Needed for | Variables |
|---|---|---|
| Firebase (Spark, free) | Auth + database | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_WEB_API_KEY` |
| Resend (optional) | 6-digit email codes and notification emails (otherwise Firebase verification links are used) | `RESEND_API_KEY`, `EMAIL_FROM` |
| Vercel Cron | Daily recurring catch-up, reminders, email digest | `CRON_SECRET` (already set) |

## Feature status

**Complete and tested** (unit/DB/E2E as noted in the test suites): registration with terms acceptance, 6-digit email OTP verification with resend and rate limits, login/logout, password recovery by code, unverified-account blocking, suspension; dashboard with 8 live overview cards, income vs expense chart, spending trend, category breakdown, budget utilisation, goals & savings progress, investment allocation, insights and recent transactions; income (received vs expected, recurring, source analysis); expenses (daily/weekly/monthly/yearly/custom views, calendar drill-down, previous-period comparison, subcategories, receipts); recurring transactions (daily/weekly/monthly/yearly, every-N, end dates, idempotent generation); budgets (overall/category, monthly/yearly, custom thresholds, 6-month comparison); goals (daily/weekly/monthly required savings, progress, ETA, statuses, what-if deadlines, multi-goal planner by priority, linked savings buckets); savings buckets (deposits, withdrawals, atomic transfers, targets, growth chart); investments (manual holdings, average-cost basis, P/L, allocation, SIP projections); debts (EMI, auto interest/principal split, prepayment scenarios, amortisation, debt-free date, reminders); net worth (single-count model, manual assets/liabilities, monthly snapshots); 12 calculators (also public at `/tools/calculators`); 11 report types with CSV, Excel and PDF export plus full JSON data export; achievements, streaks and monthly challenges; in-app notifications with preferences; settings (profile photo, currency, locale, time zone, FY start, date format, theme, categories, password, account deletion); admin console; PWA with offline shell and offline entry queue.

### Known limitations

- Verified end-to-end against an in-memory fake of Firebase (gated test mode), not yet against your real Firebase project — run the checklist in DEPLOYMENT.md §7 once the keys are added.
- One base currency per workspace; changing it relabels amounts (no FX conversion).
- Investment prices are manual; `market_data_ref` is reserved for a future price feed.
- Insights are deterministic and rule-based (no AI).
- Uploads are limited to 700 KB per file (photos are compressed automatically) to stay on Firebase's free plan.
- Admin user search loads up to 5,000 accounts in memory — fine for the free tier; add an indexed search before scaling far beyond that.
- Offline mode queues new income/expense entries only; pages aren't cached offline by design.
- PDF exports show amounts as `INR 1,000.00` (standard PDF fonts lack ₹).
- The PWA is not a native App Store / Play Store app (can be wrapped with Capacitor later).
- Legal pages are templates — have them reviewed.
