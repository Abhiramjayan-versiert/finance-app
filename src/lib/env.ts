/** Public configuration (safe to expose to the browser). */
export const publicEnv = {
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, ""),
};

/** True when the Firebase server credentials are present. Server-side only. */
export function isBackendConfigured(): boolean {
  if (process.env.FINANCE_OS_FAKE_BACKEND === "1" && !process.env.VERCEL) return true; // E2E test mode
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_WEB_API_KEY);
}

export const SESSION_COOKIE = "__session";
