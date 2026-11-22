# Releasing FINANCE OS updates on every platform

Every app — Android, iPhone, Windows, Mac, Linux, browser and home-screen app —
shows the **live website**, so almost every change reaches everyone as soon as
it is pushed and deployed.

## 1. Normal updates (screens, features, fixes) — everything except native code
1. Push to the branch → Vercel deploys automatically.
2. Every open app checks `/api/version` when it opens, when it returns to the
   foreground, and every 10 minutes. It shows **"A new version is ready —
   Update now"**. Tapping it reloads into the new version.

Nothing to submit to any store.

## 2. New native builds (only when `android/`, `ios/` or `src-tauri/` change)
Edit `src/lib/releases.ts` → set `latest` for that platform and a one-line `notes`.
After you publish the build and deploy, older installed apps show
**"Update FINANCE OS to x.y.z — Open Play Store / App Store / download page"**.

### Android
1. Bump `versionCode` (+1) and `versionName` in `android/app/build.gradle`.
2. Build: `npx cap sync android` then, in `android/`,
   `FINANCE_OS_KEYSTORE_PROPERTIES=/path/to/keystore.properties ./gradlew bundleRelease assembleRelease`
3. Play Console → your track → **Create new release** → upload the `.aab`.

### iPhone
1. Bump `MARKETING_VERSION` in `ios/App/App.xcodeproj`.
2. GitHub → Actions → **iOS app** → Run workflow (uploads to TestFlight) → submit in App Store Connect.
3. Once live, set `NEXT_PUBLIC_IOS_STORE_URL` in Vercel to the App Store link.

### Windows, Mac, Linux
1. Bump `version` in `src-tauri/tauri.conf.json` **and** `FinanceOSDesktop/x.y.z`
   in the `userAgent` of the three `tauri*.conf.json` files.
2. GitHub → Actions → **Desktop apps** → Run workflow. A draft GitHub Release
   is created with the Windows `-setup.exe`/`.msi`, Mac `.dmg` and Linux files.
3. Publish the release and set `NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL` in Vercel to its
   page (the repository must be public for others to download, or upload the
   installers anywhere public and link there).
4. Unsigned builds: Windows shows "Windows protected your PC" → More info → Run
   anyway; Mac: right-click the app → Open the first time. Code-signing
   certificates remove these warnings (Windows: ~$120+/yr; Mac: included in the
   Apple Developer Program).

## App lock (fingerprint / Face ID / Windows Hello)
- **Android & iPhone apps:** Settings → Phone app → App lock (device biometrics).
- **Browsers, home-screen apps and desktop:** Settings → Security → set up
  fingerprint / Face ID sign-in (a passkey), then turn on **Lock the app**.
  Locks on open and after a minute away; unlocking is verified by the server.
