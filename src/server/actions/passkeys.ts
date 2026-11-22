"use server";

import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import { adminAuth, getStore } from "@/lib/firebase/admin";
import { clearUnlocked, markUnlocked, refreshSession } from "@/lib/firebase/session";
import { actionWorkspace, AuthError } from "@/lib/auth";
import { userPath } from "@/lib/firebase/store";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/security/audit";
import { logServerError } from "@/lib/security/errors";
import { authenticationOptions, deletePasskey, PasskeyError, registrationOptions, verifyAuthentication, verifyRegistration } from "@/server/passkeys";

type R<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

function failure(e: unknown, fallback: string): { ok: false; error: string } {
  if (e instanceof PasskeyError || e instanceof AuthError) return { ok: false, error: e.message };
  return { ok: false, error: fallback };
}

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

/** Step 1 of "Set up Face ID": challenge for the signed-in user. */
export async function passkeyRegisterOptionsAction(): Promise<R<PublicKeyCredentialCreationOptionsJSON>> {
  try {
    const ws = await actionWorkspace();
    if (!(await rateLimit("passkey-reg", [ws.userId], 20, 900))) return { ok: false, error: TOO_MANY };
    return { ok: true, data: await registrationOptions(ws.userId, ws.email, ws.profile.full_name) };
  } catch (e) {
    if (!(e instanceof PasskeyError || e instanceof AuthError)) await logServerError(e, "passkeys/register-options");
    return failure(e, "Face ID setup is unavailable right now.");
  }
}

/** Step 2: verify the new passkey and store its public key. */
export async function passkeyRegisterVerifyAction(response: RegistrationResponseJSON, deviceName: string): Promise<R<{ name: string }>> {
  try {
    const ws = await actionWorkspace();
    const { name } = await verifyRegistration(ws.userId, response, String(deviceName ?? "").slice(0, 60));
    await audit({ id: ws.userId, email: null }, "user.passkey_added", { type: "user", id: ws.userId });
    revalidatePath("/settings");
    return { ok: true, data: { name } };
  } catch (e) {
    if (!(e instanceof PasskeyError || e instanceof AuthError)) await logServerError(e, "passkeys/register-verify");
    return failure(e, "Face ID setup could not be completed. Please try again.");
  }
}

/** Sign-in step 1 (public): a usernameless challenge. */
export async function passkeyLoginOptionsAction(): Promise<R<PublicKeyCredentialRequestOptionsJSON>> {
  try {
    if (!(await rateLimit("passkey-login-ip", [await clientIp()], 40, 900))) return { ok: false, error: TOO_MANY };
    return { ok: true, data: await authenticationOptions() };
  } catch (e) {
    if (!(e instanceof PasskeyError)) await logServerError(e, "passkeys/login-options", null, "auth");
    return failure(e, "Face ID sign-in is unavailable right now. Use your password.");
  }
}

/** Sign-in step 2: verify the assertion, apply the same account checks as password sign-in, start a session. */
export async function passkeyLoginVerifyAction(response: AuthenticationResponseJSON, next: string): Promise<R<{ redirect: string }>> {
  try {
    if (!(await rateLimit("passkey-login-ip", [await clientIp()], 40, 900))) return { ok: false, error: TOO_MANY };
    const uid = await verifyAuthentication(response);
    const user = await adminAuth().getUser(uid);
    if (user.disabled) return { ok: false, error: "This account has been suspended. Contact support for help." };
    const profile = await getStore().get<{ status?: string; deleted_at?: string | null }>(userPath(uid));
    if (!profile || profile.status === "suspended" || profile.deleted_at) return { ok: false, error: "This account is not available." };
    await refreshSession(uid);
    if (!user.emailVerified) return { ok: true, data: { redirect: `/verify?email=${encodeURIComponent(user.email ?? "")}` } };
    return { ok: true, data: { redirect: safeNext(next) } };
  } catch (e) {
    if (!(e instanceof PasskeyError)) await logServerError(e, "passkeys/login-verify", null, "auth");
    return failure(e, "Face ID sign-in failed. Use your password instead.");
  }
}

/** App lock (web & desktop): challenge limited to the signed-in user's passkeys. */
export async function passkeyUnlockOptionsAction(): Promise<R<PublicKeyCredentialRequestOptionsJSON>> {
  try {
    const ws = await actionWorkspace();
    if (!(await rateLimit("passkey-unlock", [ws.userId], 60, 900))) return { ok: false, error: TOO_MANY };
    return { ok: true, data: await authenticationOptions(ws.userId) };
  } catch (e) {
    return failure(e, "Unlock isn't available right now.");
  }
}

/** App lock: succeeds only if the passkey belongs to the account that is signed in. */
export async function passkeyUnlockVerifyAction(response: AuthenticationResponseJSON): Promise<R> {
  try {
    const ws = await actionWorkspace();
    const uid = await verifyAuthentication(response);
    if (uid !== ws.userId) return { ok: false, error: "That passkey belongs to a different account." };
    await markUnlocked();
    return { ok: true, data: undefined };
  } catch (e) {
    return failure(e, "Couldn't confirm it's you. Try again.");
  }
}

/** App lock engaged after time away: forget the unlock so a reload can't skip it. */
export async function appLockEngagedAction(): Promise<void> {
  await clearUnlocked();
}

export async function deletePasskeyAction(id: string): Promise<R> {
  try {
    const ws = await actionWorkspace();
    await deletePasskey(ws.userId, String(id));
    await audit({ id: ws.userId, email: null }, "user.passkey_removed", { type: "user", id: ws.userId });
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (e) {
    return failure(e, "Could not remove this passkey.");
  }
}
