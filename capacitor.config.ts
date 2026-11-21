import type { CapacitorConfig } from "@capacitor/cli";

/**
 * FINANCE OS native shell (Android today; iOS later).
 *
 * The app loads the live, server-rendered web app so every release reaches
 * phones instantly. Native plugins (biometric lock, reminders, haptics, status
 * bar, splash) are exposed to the web app through the Capacitor bridge.
 * `mobile/www` only holds the offline/error screen bundled inside the app.
 */
const config: CapacitorConfig = {
  appId: "com.versiert.financeos",
  appName: "FINANCE OS",
  webDir: "mobile/www",
  server: {
    url: process.env.FINANCE_OS_APP_URL ?? "https://finance-os-versiert-solutions.vercel.app",
    androidScheme: "https",
    errorPath: "index.html",
    cleartext: false,
  },
  appendUserAgent: "FinanceOSApp/1.0",
  ios: {
    // Web content handles the notch/home-indicator itself via env(safe-area-inset-*).
    contentInset: "never",
    backgroundColor: "#08080a",
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: "#08080a",
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#08080a",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#08080a",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#0a7cf0",
    },
  },
};

export default config;
