import "server-only";
import { serverEnv } from "@/lib/env.server";
import { fakeIdentity, fakeMode } from "./fake";

/**
 * Firebase Auth REST (Identity Toolkit) calls made from the server with the
 * project's web API key. Passwords are only ever sent server → Google.
 */
const BASE = "https://identitytoolkit.googleapis.com/v1";

export class IdentityError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/${method}?key=${encodeURIComponent(serverEnv.firebase.webApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new IdentityError((json.error?.message ?? "UNKNOWN").split(" ")[0]);
  return json;
}

async function fake<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new IdentityError((e as { identity?: string }).identity ?? "UNKNOWN");
  }
}

export function signInWithPassword(email: string, password: string) {
  if (fakeMode()) return fake(() => fakeIdentity.signInWithPassword(email, password));
  return call<{ idToken: string; localId: string; email: string }>("accounts:signInWithPassword", { email, password, returnSecureToken: true });
}

export function signInWithCustomToken(token: string) {
  if (fakeMode()) return fakeIdentity.signInWithCustomToken(token);
  return call<{ idToken: string }>("accounts:signInWithCustomToken", { token, returnSecureToken: true });
}

/** Firebase-hosted email (used when no custom email provider is configured). */
export function sendVerificationEmail(idToken: string) {
  if (fakeMode()) return fakeIdentity.sendOob("(token)", "VERIFY_EMAIL");
  return call("accounts:sendOobCode", { requestType: "VERIFY_EMAIL", idToken });
}

export function sendPasswordResetEmail(email: string) {
  if (fakeMode()) return fakeIdentity.sendOob(email, "PASSWORD_RESET");
  return call("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email });
}

export function isBadCredentials(e: unknown) {
  return e instanceof IdentityError && ["EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS", "INVALID_EMAIL"].includes(e.code);
}
