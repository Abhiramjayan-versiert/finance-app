# FINANCE OS

**Your Money. Your Goals. Your Future.**

A free, multi-user personal finance platform: expense & income tracking, budgets, a goal/purchase planner, savings buckets, an investment tracker, debt & EMI management, net worth, 12 calculators, reports with CSV/Excel/PDF export, achievements, notifications, a privacy-preserving super-admin console and an installable PWA.

Built with Next.js 16 (App Router) · TypeScript · Supabase (Postgres, Auth, Storage, RLS) · Tailwind CSS 4 · shadcn-style components on Radix · Recharts · Lucide · Zod. Deploys to Vercel.

> FINANCE OS is a planning and tracking tool. It is not a bank or brokerage, does not connect to financial institutions, and never stores banking passwords, OTPs or card numbers.

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
```

Apply the database migrations in `supabase/migrations/` to your Supabase project (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)), register an account, verify the emailed code, and you're in. To make yourself super admin:

```bash
npm run admin:grant -- you@example.com
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit tests: money, goals, budgets, EMI, investments, calculators, net worth, recurrence, analytics, insights, achievements, exports, validation |
| `npm run test:db` | Database tests against a local PostgreSQL (migrations, RLS isolation, privilege escalation, integrity triggers, concurrency). Needs `TEST_DATABASE_URL` (superuser) |
| `npm run test:e2e` | Playwright on desktop, mobile and tablet viewports (run `npm run build` first) |
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
    api/                  export (CSV/XLSX/JSON), cron/daily, health
    auth/confirm          email-link handler
  components/             ui primitives, layout, charts, forms and per-module components
  lib/
    finance/              pure, tested calculation modules (money, goals, budgets, debt, investments,
                          calculators, net worth, recurrence, analytics, insights, achievements, dates)
    validation/           Zod schemas
    security/             action helpers, rate limiting, audit log, error logging
    supabase/             browser, server, service-role and proxy clients
    export/               CSV and XLSX writers
    offline/              IndexedDB queue for offline entries
  server/
    actions/              server actions (all inputs validated with Zod, every write scoped to the user)
    queries/              data loaders (RLS-scoped)
    maintenance.ts        recurring materialisation, notifications, achievements, snapshots
    reports.ts            report builder shared by the Reports page and export API
  proxy.ts                session refresh + route gating (Next.js 16 "proxy", formerly middleware)
supabase/migrations/      schema, RLS, functions, reference data, admin functions
tests/unit, tests/db, e2e/
docs/                     DEPLOYMENT, SECURITY, DATABASE, ARCHITECTURE
```

## Documentation

- [Deployment guide](docs/DEPLOYMENT.md) — Supabase, email OTP, redirect URLs, GitHub, Vercel, env vars, domain, first super admin
- [Database](docs/DATABASE.md) — schema, money model, double-counting rules, migrations
- [Security](docs/SECURITY.md) — RLS, authorization, admin privacy model, headers, rate limits
- [Architecture](docs/ARCHITECTURE.md) — key decisions

## Integrations requiring credentials

| Integration | Needed for | Variables |
|---|---|---|
| Supabase | Everything (database, auth, storage) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Supabase Auth SMTP (recommended: Resend, Postmark, SES…) | Reliable OTP / recovery emails in production (Supabase's built-in sender is rate-limited) | Configured in the Supabase dashboard |
| Resend | Optional email copies of notifications | `RESEND_API_KEY`, `EMAIL_FROM` |
| Vercel Cron | Daily recurring catch-up, reminders, email digest | `CRON_SECRET` |

## Feature status

**Complete and tested** (unit/DB/E2E as noted in the test suites): registration with terms acceptance, 6-digit email OTP verification with resend and rate limits, login/logout, password recovery by code, unverified-account blocking, suspension; dashboard with 8 live overview cards, income vs expense chart, spending trend, category breakdown, budget utilisation, goals & savings progress, investment allocation, insights and recent transactions; income (received vs expected, recurring, source analysis); expenses (daily/weekly/monthly/yearly/custom views, calendar drill-down, previous-period comparison, subcategories, receipts); recurring transactions (daily/weekly/monthly/yearly, every-N, end dates, idempotent generation); budgets (overall/category, monthly/yearly, custom thresholds, 6-month comparison); goals (daily/weekly/monthly required savings, progress, ETA, statuses, what-if deadlines, multi-goal planner by priority, linked savings buckets); savings buckets (deposits, withdrawals, atomic transfers, targets, growth chart); investments (manual holdings, average-cost basis, P/L, allocation, SIP projections); debts (EMI, auto interest/principal split, prepayment scenarios, amortisation, debt-free date, reminders); net worth (single-count model, manual assets/liabilities, monthly snapshots); 12 calculators (also public at `/tools/calculators`); 11 report types with CSV, Excel and PDF export plus full JSON data export; achievements, streaks and monthly challenges; in-app notifications with preferences; settings (profile photo, currency, locale, time zone, FY start, date format, theme, categories, password, account deletion); admin console; PWA with offline shell and offline entry queue.

### Known limitations

- **Not verified against a live Supabase project from this build environment.** Database logic, RLS and triggers were tested on PostgreSQL 16 with a Supabase-compatible auth stub; UI flows that need a live Supabase Auth server (sign-up email delivery, OTP verification, signed-in pages) are implemented but should be smoke-tested after you connect a project (checklist in DEPLOYMENT.md §11).
- Multiple currencies: each workspace has one base currency. Changing it relabels amounts; there is no FX conversion.
- Investment prices are manual. The `investments.market_data_ref` column is reserved for a future market-data integration.
- Insights are deterministic and rule-based (no AI). An AI integration would need explicit consent and a server-side API.
- Offline mode queues new income/expense entries only; other edits need a connection. Pages are not available offline by design (privacy).
- PDF exports label amounts with ISO codes (e.g. `INR 1,000.00`) because standard PDF fonts lack the ₹ glyph.
- Native App Store / Play Store apps are not included; the PWA can be wrapped later (e.g. Capacitor) without architectural changes.
- Legal pages are templates — have them reviewed for your jurisdiction.
