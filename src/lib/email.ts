import "server-only";
import { isEmailConfigured, serverEnv } from "@/lib/env.server";
import { fakeMode, fakeSendEmail } from "@/lib/firebase/fake";

/** Sends a transactional email via Resend's REST API. Returns true only on a 2xx response. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  if (fakeMode()) return fakeSendEmail(to, subject, text);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: serverEnv.emailFrom, to: [to], subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
