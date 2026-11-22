import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, publicEnv } from "@/lib/env";
import { adminAuth } from "./admin";
import { signInWithCustomToken } from "./identity";
import { UNLOCKED_COOKIE } from "@/lib/app-lock";

export const SESSION_DAYS = 5;

/** Exchanges a fresh ID token for an httpOnly session cookie. */
export async function startSession(idToken: string) {
  const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, cookie, { httpOnly: true, secure: publicEnv.siteUrl.startsWith("https://"), sameSite: "lax", path: "/", maxAge: expiresIn / 1000 });
  // Just signed in: don't ask for the app lock again until the browser closes or the app re-locks.
  await markUnlocked();
}

/** Re-issues the session (e.g. after email verification so claims are current). */
export async function refreshSession(uid: string) {
  const token = await adminAuth().createCustomToken(uid);
  const { idToken } = await signInWithCustomToken(token);
  await startSession(idToken);
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(UNLOCKED_COOKIE);
}

/** App lock: session-only marker (no max-age) so closing the browser locks again. */
export async function markUnlocked() {
  (await cookies()).set(UNLOCKED_COOKIE, "1", { httpOnly: true, secure: publicEnv.siteUrl.startsWith("https://"), sameSite: "lax", path: "/" });
}

export async function clearUnlocked() {
  (await cookies()).delete(UNLOCKED_COOKIE);
}

export async function readSessionCookie() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
