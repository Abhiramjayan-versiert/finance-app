import "server-only";

function privateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY ?? "";
  // Vercel stores multi-line values fine, but many people paste the JSON-escaped form.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export const serverEnv = {
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
    privateKey: privateKey(),
    webApiKey: process.env.FIREBASE_WEB_API_KEY ?? "",
  },
  /** HMAC key for one-time codes. Falls back to a value derived from the service-account key. */
  otpSecret: process.env.OTP_SECRET ?? process.env.FIREBASE_PRIVATE_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
};

export function isEmailConfigured(): boolean {
  if (process.env.FINANCE_OS_FAKE_BACKEND === "1" && !process.env.VERCEL) return process.env.FINANCE_OS_FAKE_EMAIL !== "link";
  return Boolean(serverEnv.resendApiKey && serverEnv.emailFrom);
}
