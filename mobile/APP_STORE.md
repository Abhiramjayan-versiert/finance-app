# FINANCE OS — iPhone app (App Store) guide

Bundle ID: `com.versiert.financeos` · Version 1.0.0 · iPhone · iOS 15+

Like Android, the iPhone app is a native Capacitor shell around the live web app,
so website updates reach it instantly. A new App Store build is only needed when
native code changes.

## Native features on iPhone
- **Face ID app lock** (Touch ID / passcode fallback) — Settings → Phone app → App lock.
  Asks on launch and after 30 s in the background; hides content in the app switcher.
- **Bill & EMI reminders** and an optional **daily reminder** (on-device notifications).
- **Haptics**, swipe-from-the-edge to go back, themed status bar, splash screen.
- **Exports** open the iOS share sheet (Files, iCloud Drive, WhatsApp, Mail…).
- **Offline screen** built into the app.

In Safari / home-screen web app, users can instead use **Sign in with Face ID**
(passkeys) — Settings → Security.

## Why a cloud Mac
Apple only allows iPhone apps to be compiled on macOS. The workflow
`.github/workflows/ios.yml` builds, signs and uploads the app on a GitHub-hosted
Mac, so you do not need to own one.
(Private repos: macOS minutes count 10× against the free Actions allowance; one
build is roughly 10–15 minutes.)

## One-time setup (about 30 minutes, after Apple approves your account)
1. **Join the Apple Developer Program** — developer.apple.com/programs ($99/year).
   Individual: Apple ID + ID check. Organisation: needs a free D-U-N-S number.
2. **Note your Team ID** — developer.apple.com → Account → Membership details (10 characters).
3. **Create the app record** — appstoreconnect.apple.com → Apps → **+** → New App:
   - Platform iOS · Name **FINANCE OS** · Primary language English
   - Bundle ID: register `com.versiert.financeos` (if it isn't listed, add it at
     developer.apple.com → Identifiers → **+** → App IDs → App, explicit ID
     `com.versiert.financeos`; no extra capabilities needed)
   - SKU: `financeos-ios`
4. **Create an App Store Connect API key** — App Store Connect → Users and Access →
   **Integrations** → App Store Connect API → **Generate API Key**, role **App Manager**.
   Download the `.p8` file (you can only download it once) and note the **Key ID**
   and the **Issuer ID** shown above the table.
5. **Add four GitHub secrets** — github.com → this repository → Settings → Secrets and
   variables → Actions → **New repository secret**:
   | Name | Value |
   |---|---|
   | `APPLE_TEAM_ID` | your Team ID |
   | `ASC_KEY_ID` | the API Key ID |
   | `ASC_ISSUER_ID` | the Issuer ID |
   | `ASC_KEY_P8` | the .p8 file, base64-encoded: on a Mac `base64 -i AuthKey_XXXX.p8 \| pbcopy`; on Windows PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8")) \| Set-Clipboard` |

## Build and test
1. GitHub → **Actions** → **iOS app** → **Run workflow** (keep "Upload to TestFlight" ticked).
2. ~15–30 minutes later the build appears in App Store Connect → your app → **TestFlight**
   (Apple processes it first). Answer the export-compliance question if asked: the app
   only uses standard HTTPS encryption (already declared in Info.plist).
3. Add yourself under **Internal Testing**, install **TestFlight** on your iPhone, and install FINANCE OS.
4. Test: sign in → Settings → Phone app → App lock (Face ID) and reminders; exports; swipe back.

## Submit for review
App Store Connect → your app → the 1.0.0 version page:
- **Screenshots**: 6.9" iPhone (1320 × 2868) — at least 3. Ready-made ones are in
  `mobile/store/ios/`.
- **Promotional text / description / keywords**: reuse the Play Store text in
  `mobile/PLAY_STORE.md` (keywords e.g. `budget,expense tracker,savings,goals,emi,net worth,finance`).
- **Support URL**: `https://finance-os-versiert-solutions.vercel.app`
- **Privacy Policy URL**: `https://finance-os-versiert-solutions.vercel.app/privacy`
- **App Privacy** (data collection): Contact Info → Name, Email Address; Financial Info →
  Other Financial Info; User Content → Photos (optional receipts) and Other User Content.
  All **linked to the user**, used for **App Functionality**, **not used for tracking**.
- **Age rating**: complete the questionnaire (no objectionable content) → 4+.
- **Category**: Finance.
- **App Review Information**: give a demo account email + password (create a test
  account), and a note such as:
  > FINANCE OS is a personal budgeting and planning tool. It does not move money, connect
  > to banks, or provide financial advice. Face ID is used only to lock the app.
- **Account deletion**: available in-app (Settings → Your data) and at /delete-account.

Then **Add for Review** → **Submit**. First reviews usually take 1–3 days.

## Updating later
- Website changes: nothing to do — the app loads the live site and auto-updates.
- Native changes: bump `MARKETING_VERSION` in `ios/App/App.xcodeproj` (e.g. 1.0.1) and
  run the workflow again; the build number is set automatically.
