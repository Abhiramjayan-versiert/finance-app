import "server-only";

/**
 * Normalises FIREBASE_PRIVATE_KEY however it was pasted: the bare key, the key
 * wrapped in quotes (with or without a trailing comma), with literal "\n"
 * escapes, with spaces where line breaks were lost, or the entire
 * service-account JSON file.
 */
export function normalizePrivateKey(raw: string): string {
  let v = raw.trim();
  if (v.startsWith("{")) {
    try {
      v = String((JSON.parse(v) as { private_key?: string }).private_key ?? "");
    } catch {
      const m = v.match(/"private_key"\s*:\s*"([^"]+)"/);
      if (m) v = m[1];
    }
  }
  v = v.trim().replace(/,$/, "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  v = v.replace(/\\r\\n|\\n/g, "\n").replace(/\r\n/g, "\n");
  const m = v.match(/-----BEGIN ([A-Z ]*)PRIVATE KEY-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----/);
  if (!m) return v;
  const body = m[2].replace(/[^A-Za-z0-9+/=]/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${m[1]}PRIVATE KEY-----\n${lines.join("\n")}\n-----END ${m[1]}PRIVATE KEY-----\n`;
}

function privateKey() {
  return normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY ?? "");
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
