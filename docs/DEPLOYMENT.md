# Deployment guide (Firebase + Vercel)

FINANCE OS is a standalone application: its own **Firebase project** (Auth + Firestore) and its own **Vercel project** (`finance-os` in the Versiert Solutions team, production URL `https://finance-os-versiert-solutions.vercel.app`).

Everything runs on free tiers: Firebase **Spark** plan (no billing account needed) and Vercel.

## 1. Create the Firebase project (≈5 minutes)

1. Open <https://console.firebase.google.com> → **Create a project** → name it `finance-os`. Google Analytics is optional (you can turn it off).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable** (leave "Email link" off) → Save.
3. **Build → Firestore Database → Create database** → choose **Production mode** and the location **asia-south1 (Mumbai)** (or the region closest to your users; it can't be changed later).
4. Firestore → **Rules** tab: paste the contents of `firestore.rules` from this repo (deny all client access) → **Publish**. (Production mode already denies everything; this makes it explicit.)
5. **Project settings (⚙) → General**: copy the **Web API key** → this is `FIREBASE_WEB_API_KEY`. (If it shows "No API key", click *Add app → Web* once to create it; you don't need the config snippet.)
6. **Project settings → Service accounts → Generate new private key** → download the JSON file. Keep it secret; never commit it.

## 2. Add environment variables in Vercel

Vercel → project **finance-os** → **Settings → Environment Variables**. Add each for **Production** and **Preview** (mark them *Sensitive*):

| Variable | Where it comes from |
|---|---|
| `FIREBASE_PROJECT_ID` | `project_id` in the JSON file |
| `FIREBASE_CLIENT_EMAIL` | `client_email` in the JSON file |
| `FIREBASE_PRIVATE_KEY` | `private_key` in the JSON file — paste the whole value including `-----BEGIN PRIVATE KEY-----`/`-----END PRIVATE KEY-----` (the `\n` escapes are fine) |
| `FIREBASE_WEB_API_KEY` | step 1.5 |
| `NEXT_PUBLIC_SITE_URL` | optional — defaults to the production URL; set it if you add a custom domain |
| `CRON_SECRET` | already set |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional, see §3 |

Then **Deployments → latest → ⋯ → Redeploy**. Until the Firebase variables exist, protected pages show a "Finish configuring" screen; the landing page and public calculators already work.

## 3. Email verification modes

- **Without Resend (default, free):** Firebase sends its own verification and password-reset **links**. After clicking the link, users press *I've verified my email — continue*.
- **With Resend (6-digit codes):** create a free account at <https://resend.com>, verify a sending domain, create an API key, and set `RESEND_API_KEY` plus `EMAIL_FROM` (e.g. `FINANCE OS <no-reply@yourdomain.com>`). Sign-up and password reset then use 6-digit codes (10-minute expiry, 5 attempts, one-time) and notification emails are enabled.

Optionally customise Firebase's link emails under **Authentication → Templates** and add your domain under **Authentication → Settings → Authorized domains**.

## 4. Create the first super admin

Register and verify your own account in the app, then run locally with the same variables in `.env.local`:

```bash
npm run admin:grant -- you@example.com
```

Or in the Firebase console: Firestore → `users` → your document → add `super_admin` to the `roles` array. Then open `/admin`.

## 5. Custom domain (optional)

Vercel → **Settings → Domains → Add**, create the DNS records shown, then set `NEXT_PUBLIC_SITE_URL` to the new domain, add it to Firebase **Authorized domains**, and redeploy.

## 6. Cron

`vercel.json` schedules `/api/cron/daily` at 02:30 UTC (08:00 IST). It catches up recurring transactions, generates reminders and sends opt-in email digests. Manual run: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/daily`.

## 7. Post-deployment checklist

- [ ] `GET /api/health` → `{"ok":true,"db":"ok"}`
- [ ] Register → verify (link or code) → dashboard
- [ ] Add income/expenses, a budget, a goal, savings + transfer, an investment, a debt payment
- [ ] Export CSV / Excel / PDF from Reports
- [ ] A second account sees none of the first account's data
- [ ] `/admin` works for the super admin only
- [ ] Install the PWA (Chrome install icon / Safari → Share → Add to Home Screen)

## Free-tier capacity
Firestore Spark allows 50k reads, 20k writes and 1 GiB storage per day/total. Dashboards read pre-aggregated monthly totals (~20 documents per load), so this comfortably supports hundreds of daily active users. Upgrade to Blaze (pay-as-you-go) if you outgrow it — no code changes needed.
