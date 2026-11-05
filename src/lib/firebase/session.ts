import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, publicEnv } from "@/lib/env";
import { adminAuth } from "./admin";
import { signInWithCustomToken } from "./identity";

export const SESSION_DAYS = 5;

/** Exchanges a fresh ID token for an httpOnly session cookie. */
export async function startSession(idToken: string) {
  const expiresIn = SESSION_DAYS * 24 * 60 * 60 * 1000;
  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn });
  (await cookies()).set(SESSION_COOKIE, cookie, { httpOnly: true, secure: publicEnv.siteUrl.startsWith("https://"), sameSite: "lax", path: "/", maxAge: expiresIn / 1000 });
}

/** Re-issues the session (e.g. after email verification so claims are current). */
export async function refreshSession(uid: string) {
  const token = await adminAuth().createCustomToken(uid);
  const { idToken } = await signInWithCustomToken(token);
  await startSession(idToken);
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSessionCookie() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
