# Deployment guide

Target: **Vercel** (frontend + server) and **Supabase** (Postgres, Auth, Storage).

## 1. Create the Supabase project

1. Sign in at <https://supabase.com/dashboard> → **New project**. Pick a region close to your users (e.g. `ap-south-1` Mumbai for India). Use a **dedicated project** for FINANCE OS — the migrations create tables such as `notifications`, `rate_limits` and `profiles` that may collide with other apps.
2. Save the database password somewhere safe.
3. From **Project Settings → API** copy the **Project URL**, the **anon / publishable key** and the **service_role / secret key**.

## 2. Apply the database migrations

Option A — Supabase CLI (recommended):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # applies supabase/migrations/*.sql in order
```

Option B — Dashboard: open **SQL Editor** and run each file in `supabase/migrations/` in filename order (`…0001_core_schema.sql` → `…0004_admin_functions.sql`).

Migrations create all tables, RLS policies, functions, storage buckets (`receipts`, `avatars`, `goal-images` — private) and reference data (default categories, achievements, notification templates, platform settings). Afterwards, check **Database → Advisors** for warnings.

## 3. Configure email OTP

FINANCE OS verifies emails with a **6-digit code**.

1. **Authentication → Sign In / Providers → Email**: enable *Email*, enable **Confirm email**, and set *Email OTP length* to 6 and *Email OTP expiration* to 900 seconds (15 min) or less.
2. **Authentication → Email Templates**:
   - *Confirm signup*: paste `supabase/templates/confirmation.html` (uses `{{ .Token }}`). Subject: `Your FINANCE OS verification code`.
   - *Reset password*: paste `supabase/templates/recovery.html`.
3. **Authentication → SMTP Settings**: configure a real SMTP provider for production. The built-in sender is limited to a few emails per hour and is meant for testing.
4. **Authentication → Rate Limits**: keep email sending and verification limits conservative. The app also applies its own per-email and per-IP limits.
5. **Authentication → Policies / Passwords**: minimum length 8, require lower+upper case and digits (matches the app's validation). Optionally enable leaked-password protection.

## 4. Configure authentication redirect URLs

**Authentication → URL Configuration**:

- *Site URL*: `https://your-domain.com` (or the Vercel URL initially).
- *Redirect URLs*: add
  - `https://your-domain.com/auth/confirm`
  - `https://*-your-team.vercel.app/auth/confirm` (preview deployments, optional)
  - `http://localhost:3000/auth/confirm` (local development)

## 5. Connect GitHub

Push this repository to GitHub (already done if you are reading this from GitHub). CI in `.github/workflows/ci.yml` runs lint, typecheck, unit tests, database tests (Postgres service), build and Playwright on every push/PR.

## 6. Import the project into Vercel

1. <https://vercel.com/new> → **Import Git Repository** → select the repo.
2. Framework preset: **Next.js** (auto-detected). Build command `next build`, output default. Node 20+.
3. The repository's `.npmrc` sets `legacy-peer-deps=true` so installs succeed; nothing else to change.

## 7. Add environment variables

In **Project → Settings → Environment Variables** add (Production, and Preview if you use previews):

| Variable | Value | Exposed to browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | yes |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` (no trailing slash) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | **no — server only** |
| `CRON_SECRET` | `openssl rand -hex 32` | no |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional, for notification emails | no |

Never add the service-role key with a `NEXT_PUBLIC_` prefix.

## 8. Deploy

Click **Deploy** (or push to `main`). `vercel.json` registers a daily cron (`30 2 * * *` UTC ≈ 08:00 IST) at `/api/cron/daily`; Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. Verify with `GET /api/health` → `{"ok":true,"db":"ok"}`.

## 9. Custom domain

**Project → Settings → Domains → Add**, then create the DNS records Vercel shows (A/ALIAS for apex, CNAME for `www`). After it verifies, update `NEXT_PUBLIC_SITE_URL`, the Supabase *Site URL* and *Redirect URLs* to the new domain, and redeploy.

## 10. Create the first super admin

Admin access is never granted from the browser. After you register and verify your own account:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run admin:grant -- you@example.com
```

Or in the Supabase SQL editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin' from public.profiles where lower(email) = lower('you@example.com')
on conflict do nothing;
```

Then open `/admin`. Super admins can grant `admin`/`support` roles to others from **Admin → Users**.

## 11. Post-deployment verification checklist

- [ ] Register → receive a 6-digit code → verify → land on the dashboard.
- [ ] Wrong / expired code shows an error; *resend* works and is rate limited.
- [ ] Forgot password → code → new password works.
- [ ] Add income, an expense with a receipt, a recurring expense; dashboard cards update.
- [ ] Create a budget, a goal (with opening savings), a savings bucket and a transfer; cash balance is unchanged by the transfer.
- [ ] Add an investment, a debt and a payment; net worth reflects each once.
- [ ] Reports export CSV, Excel and PDF.
- [ ] A second account cannot see the first account's data.
- [ ] `/admin` loads for the super admin only; suspend/reactivate a test user.
- [ ] Install the PWA from Chrome (desktop/Android: install icon / menu) and Safari on iOS (Share → *Add to Home Screen*).
- [ ] Trigger the cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/daily`.

## Error monitoring

Server errors are written to `public.app_errors` (visible in **Admin → System health**) and to the Vercel function logs. For external monitoring, add Sentry (`@sentry/nextjs`) or Vercel Observability; `logServerError` in `src/lib/security/errors.ts` is the single hook to extend.
