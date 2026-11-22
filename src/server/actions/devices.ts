"use server";

import { adminAuth, getStore } from "@/lib/firebase/admin";
import { refreshSession } from "@/lib/firebase/session";
import { getSessionUser } from "@/lib/auth";
import { userPath } from "@/lib/firebase/store";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/security/errors";
import { consumeDeviceToken, issueDeviceToken, revokeDeviceToken } from "@/server/device-tokens";

/** Phone apps: remember this device for the signed-in user. */
export async function rememberDeviceAction(platform: string): Promise<{ token: string } | null> {
  const user = await getSessionUser();
  if (!user || !user.emailVerified) return null;
  if (!(await rateLimit("device-issue", [user.uid], 30, 3600))) return null;
  return { token: await issueDeviceToken(user.uid, String(platform || "app")) };
}

/** Phone apps: restore a lost session from a remembered-device key (rotated on use). */
export async function resumeDeviceAction(token: string): Promise<{ token: string } | null> {
  try {
    if (!(await rateLimit("device-resume-ip", [await clientIp()], 30, 900))) return null;
    const used = await consumeDeviceToken(String(token));
    if (!used) return null;
    const user = await adminAuth().getUser(used.uid).catch(() => null);
    if (!user || user.disabled || !user.emailVerified) return null;
    const profile = await getStore().get<{ status?: string; deleted_at?: string | null }>(userPath(used.uid));
    if (!profile || profile.status === "suspended" || profile.deleted_at) return null;
    await refreshSession(used.uid);
    return { token: await issueDeviceToken(used.uid, used.platform) };
  } catch (e) {
    await logServerError(e, "devices/resume", null, "auth");
    return null;
  }
}

/** Sign-out on a phone: forget this device. */
export async function forgetDeviceAction(token: string): Promise<void> {
  await revokeDeviceToken(String(token)).catch(() => {});
}
