# FINANCE OS — Google Play release guide

App ID: `com.versiert.financeos` · Version 1.0.0 (code 1) · Target SDK 36 (Android 16) · Min SDK 24 (Android 7)

The Android app is a native Capacitor shell around the live web app
(`https://finance-os-versiert-solutions.vercel.app`). Website updates reach the
app instantly; you only publish a new build when native code changes.

## Native features
- **App lock** — fingerprint, face unlock or the phone's PIN/pattern; asks on launch and after 30 s in the background. Hides content in the app switcher.
- **Bill & EMI reminders** — on-device notifications the day before and on the due date (Settings → Phone app).
- **Daily spending reminder** — optional, at a time you choose.
- **Haptics**, themed status bar, splash screen, Android back button (closes dialogs first).
- **Exports** (CSV, Excel, PDF, full data) open the Android share sheet → save to Files/Drive or send.
- **Offline screen** bundled in the app.

## Build
```bash
npm ci
npx cap sync android
cd android
FINANCE_OS_KEYSTORE_PROPERTIES=/path/to/keystore.properties ./gradlew bundleRelease assembleRelease
```
Outputs: `android/app/build/outputs/bundle/release/app-release.aab` (upload this) and
`android/app/build/outputs/apk/release/app-release.apk` (install on phones for testing).

Before each new release, bump `versionCode` (+1) and `versionName` in `android/app/build.gradle`.

## Signing key — keep it safe
`financeos-upload.jks` + its password are your **upload key**. Store them in a
password manager and a second backup. Never commit them. With Play App Signing
(default), Google holds the real app-signing key; if the upload key is lost,
Google can reset it after identity checks.

## Step-by-step: publish
1. **Create a developer account** at play.google.com/console ($25 one-time). Choose *Personal* or *Organization* (organization needs a D-U-N-S number). Complete identity verification.
2. **Create app** → name "FINANCE OS", default language English (India) or English (US), *App*, *Free*.
3. **Set up your app** (Dashboard checklist):
   - Privacy policy: `https://finance-os-versiert-solutions.vercel.app/privacy`
   - App access: *All or some functionality is restricted* → add demo login (create a test account and give its email/password).
   - Ads: *No ads*.
   - Content rating: complete questionnaire (category: *Utility/Productivity*; no violence, no user-to-user chat, no gambling) → likely *Everyone*.
   - Target audience: 18+.
   - News app: No. COVID app: No. Government app: No.
   - **Financial features declaration**: select the personal-finance / budgeting option (wording varies). State clearly that the app does **not** offer loans, banking, payments, money transfers, crypto trading or investment advice — it only records what the user types in.
   - Data safety: see answers below.
   - Account deletion URL: `https://finance-os-versiert-solutions.vercel.app/delete-account`
4. **Store listing**: paste the text below; upload `icon-512.png`, `feature-graphic-1024x500.png`, and the phone screenshots in `mobile/store/android/` (1080 × 1920).
5. **Testing → Closed testing** → create track → upload `app-release.aab` → add **at least 12 testers** (their Gmail addresses) → they must opt in and keep the app installed for **14 days** (required for new personal accounts).
6. After 14 days: **Apply for production access**, answer the questions, then **Production → Create release** → upload the same/new AAB → roll out.

## Store listing text
**App name:** FINANCE OS

**Short description (≤80):**
Track spending, budgets, goals, savings, investments & debt — private and free.

**Full description:**
FINANCE OS is a private, all-in-one money planner. Track what you earn and spend, set budgets that warn you before you overspend, and plan goals with exactly how much to save each day, week and month.

• Expenses & income — categories, receipts, recurring bills, bank-statement CSV import
• Budgets — monthly and category limits with alerts
• Goals — plan a phone, trip or house deposit with a clear savings plan
• Savings pots — emergency fund and more, never counted as spending
• Investments — mutual funds, SIPs, stocks, gold, FDs with returns and allocation
• Debt & EMIs — repayment progress, interest split and debt-free date
• Net worth — everything you own minus everything you owe, month by month
• 12 calculators — EMI, SIP, compound interest, retirement, FIRE and more
• Reports — charts plus CSV, Excel and PDF export
• "Safe to spend" — what you can spend per day after bills and savings

Built for privacy: FINANCE OS never asks for bank passwords, OTPs or card numbers and never connects to your bank. App lock with fingerprint or face unlock, and reminders for upcoming bills and EMIs.

FINANCE OS is a planning tool — not a bank, broker or financial adviser.

**Category:** Finance · **Tags:** Budget, Expense tracker, Personal finance
**Contact email:** your support email

## Data safety answers
- Does your app collect or share user data? **Yes, collects. Does not share.**
- Is all data encrypted in transit? **Yes** (HTTPS only).
- Can users request deletion? **Yes** (in-app and via the deletion URL).
- Data types collected (all: *Collected*, *not shared*, *required* unless noted, purpose **App functionality** + **Account management**):
  - Personal info → **Name**, **Email address**
  - Financial info → **Other financial info** (transactions, budgets, goals, balances the user types in)
  - Photos and videos → **Photos** (*optional*, receipts / goal images the user uploads)
  - App activity → **Other user-generated content** (notes)
- Not collected: location, contacts, device IDs/advertising ID, health, messages, browsing history, purchase history from stores, credit score.
- Biometrics: handled by Android on-device; **not collected** by the app.

## Permissions used (and why)
| Permission | Why |
|---|---|
| INTERNET, ACCESS_NETWORK_STATE | Load your workspace; show offline screen |
| USE_BIOMETRIC / USE_FINGERPRINT | Optional app lock |
| POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, WAKE_LOCK | Bill/EMI and daily reminders (kept after reboot) |
| VIBRATE | Haptic feedback |

Exact-alarm permissions are deliberately removed (Play restricts them to alarm/calendar apps).
