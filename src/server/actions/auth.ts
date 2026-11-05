"use server";

import { redirect } from "next/navigation";
import { adminAuth, getStore } from "@/lib/firebase/admin";
import { IdentityError, isBadCredentials, sendPasswordResetEmail, sendVerificationEmail, signInWithPassword } from "@/lib/firebase/identity";
import { endSession, refreshSession, startSession } from "@/lib/firebase/session";
import { consumeOtp, issueOtp } from "@/lib/firebase/otp";
import { isEmailConfigured } from "@/lib/env.server";
import { sendEmail } from "@/lib/email";
import { getSessionUser } from "@/lib/auth";
import { bootstrapWorkspace, getPlatformSettings } from "@/server/data/users";
import { changePasswordSchema, emailOnlySchema, loginSchema, otpSchema, registerSchema, resetPasswordSchema } from "@/lib/validation/schemas";
import { fail, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/security/errors";

const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

/** Sends a verification code (custom email) or Firebase's verification link. */
async function sendVerification(email: string, idToken?: string) {
  if (isEmailConfigured()) {
    const code = await issueOtp("verify", email);
    const sent = await sendEmail(email, "Your FINANCE OS verification code", `Your FINANCE OS verification code is ${code}\n\nIt expires in 10 minutes and can be used once. If you didn't create an account, ignore this email.`);
    if (!sent) throw new Error("Verification email could not be sent");
    return "code" as const;
  }
  if (!idToken) throw new Error("Missing ID token for link verification");
  await sendVerificationEmail(idToken);
  return "link" as const;
}

export async function registerAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(registerSchema, fd);
  if (!p.ok) return p.result;
  const { fullName, email, password } = p.data;
  if (!(await rateLimit("register", [await clientIp()], 10, 3600))) return fail(TOO_MANY);
  const store = getStore();
  if (!(await getPlatformSettings(store)).signups_enabled) return fail("New registrations are currently disabled.");

  let uid: string;
  try {
    uid = (await adminAuth().createUser({ email, password, displayName: fullName, emailVerified: false })).uid;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/email-already-exists") return fail("An account with this email already exists. Sign in or reset your password.", { email: "Already registered" });
    if (code === "auth/invalid-password") return fail("Choose a stronger password.", { password: "Too weak" });
    await logServerError(e, "auth/register", null, "auth");
    return fail("We could not create your account. Please try again.");
  }
  try {
    await bootstrapWorkspace(store, uid, email, fullName);
    const { idToken } = await signInWithPassword(email, password);
    await startSession(idToken); // unverified session: only /verify is reachable
    const mode = await sendVerification(email, idToken);
    redirect(`/verify?email=${encodeURIComponent(email)}&sent=1&mode=${mode}`);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect
    await logServerError(e, "auth/register-bootstrap", uid, "auth");
    return fail("Your account was created but we couldn't send the verification email. Sign in to resend it.");
  }
}

export async function verifyOtpAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(otpSchema, fd);
  if (!p.ok) return p.result;
  const { email, token } = p.data;
  if (!(await rateLimit("verify", [email], 10, 900)) || !(await rateLimit("verify-ip", [await clientIp()], 30, 900))) return fail(TOO_MANY);
  const result = await consumeOtp("verify", email, token);
  if (result !== "ok") {
    const msg = result === "expired" ? "This code has expired. Request a new one." : result === "locked" ? "Too many wrong codes. Request a new one." : "That code is not valid. Check the email and try again.";
    return fail(msg, { token: msg });
  }
  const user = await adminAuth().getUserByEmail(email).catch(() => null);
  if (!user) return fail("Account not found.");
  await adminAuth().updateUser(user.uid, { emailVerified: true });
  await refreshSession(user.uid);
  redirect("/dashboard?welcome=1");
}

/** Link mode: the user clicked Firebase's link; confirm and upgrade the session. */
export async function confirmLinkVerifiedAction(): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return fail("Please sign in again to finish verification.");
  const user = await adminAuth().getUser(session.uid);
  if (!user.emailVerified) return fail("We haven't seen the verification yet. Click the link in the email, then try again.");
  await refreshSession(user.uid);
  redirect("/dashboard?welcome=1");
}

export async function resendOtpAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(emailOnlySchema, fd);
  if (!p.ok) return p.result;
  const { email } = p.data;
  if (!(await rateLimit("resend", [email], 3, 900)) || !(await rateLimit("resend-ip", [await clientIp()], 10, 900))) return fail("You can request a new code a few times every 15 minutes. Please wait and try again.");
  try {
    const user = await adminAuth().getUserByEmail(email).catch(() => null);
    if (user && !user.emailVerified) {
      if (isEmailConfigured()) await sendVerification(email);
      else {
        const session = await getSessionUser();
        if (!session || session.uid !== user.uid) return fail("Sign in first, then request a new verification email.");
        const { signInWithCustomToken } = await import("@/lib/firebase/identity");
        const { idToken } = await signInWithCustomToken(await adminAuth().createCustomToken(user.uid));
        await sendVerification(email, idToken);
      }
    }
  } catch (e) {
    await logServerError(e, "auth/resend", null, "auth");
    return fail("We could not send a new email right now. Please try again shortly.");
  }
  return ok("If an unverified account exists for this email, a new verification email has been sent.");
}

export async function loginAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(loginSchema, fd);
  if (!p.ok) return p.result;
  const { email, password } = p.data;
  if (!(await rateLimit("login", [email], 10, 900)) || !(await rateLimit("login-ip", [await clientIp()], 50, 900))) return fail(TOO_MANY);
  let idToken: string;
  let uid: string;
  try {
    const r = await signInWithPassword(email, password);
    idToken = r.idToken;
    uid = r.localId;
  } catch (e) {
    if (isBadCredentials(e)) return fail("Incorrect email or password.");
    if (e instanceof IdentityError && e.code === "USER_DISABLED") return fail("This account has been suspended. Contact support for help.");
    if (e instanceof IdentityError && e.code.startsWith("TOO_MANY_ATTEMPTS")) return fail(TOO_MANY);
    await logServerError(e, "auth/login", null, "auth");
    return fail("Sign-in is temporarily unavailable. Please try again.");
  }
  const user = await adminAuth().getUser(uid);
  await bootstrapWorkspace(getStore(), uid, user.email ?? email, user.displayName ?? ""); // heal missing workspace
  await startSession(idToken);
  if (!user.emailVerified) redirect(`/verify?email=${encodeURIComponent(email)}&mode=${isEmailConfigured() ? "code" : "link"}`);
  redirect(safeNext(fd.get("next")));
}

export async function logoutAction() {
  const session = await getSessionUser();
  if (session) await adminAuth().revokeRefreshTokens(session.uid).catch(() => {});
  await endSession();
  redirect("/login?signedOut=1");
}

export async function forgotPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(emailOnlySchema, fd);
  if (!p.ok) return p.result;
  const { email } = p.data;
  if (!(await rateLimit("recover", [email], 3, 900)) || !(await rateLimit("recover-ip", [await clientIp()], 10, 900))) return fail(TOO_MANY);
  let mode: "code" | "link" = isEmailConfigured() ? "code" : "link";
  try {
    const user = await adminAuth().getUserByEmail(email).catch(() => null);
    if (user) {
      if (mode === "code") {
        const code = await issueOtp("reset", email);
        const sent = await sendEmail(email, "Your FINANCE OS password reset code", `Your password reset code is ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email — your password is unchanged.`);
        if (!sent) mode = "link";
      }
      if (mode === "link") await sendPasswordResetEmail(email);
    }
  } catch (e) {
    await logServerError(e, "auth/recover", null, "auth");
  }
  // Same response whether or not the account exists (no enumeration).
  redirect(`/reset-password?email=${encodeURIComponent(email)}&mode=${mode}`);
}

export async function resetPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(resetPasswordSchema, fd);
  if (!p.ok) return p.result;
  const { email, token, password } = p.data;
  if (!(await rateLimit("reset", [email], 10, 900))) return fail(TOO_MANY);
  const result = await consumeOtp("reset", email, token);
  if (result !== "ok") return fail(result === "expired" ? "This code has expired. Request a new one." : "That code is not valid.", { token: "Invalid or expired code" });
  const user = await adminAuth().getUserByEmail(email).catch(() => null);
  if (!user) return fail("That code is not valid.");
  await adminAuth().updateUser(user.uid, { password, emailVerified: true });
  await adminAuth().revokeRefreshTokens(user.uid); // sign out other devices
  const { idToken } = await signInWithPassword(email, password);
  await startSession(idToken);
  redirect("/dashboard?passwordReset=1");
}

export async function changePasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(changePasswordSchema, fd);
  if (!p.ok) return p.result;
  const session = await getSessionUser();
  if (!session) return fail("Your session has expired. Please sign in again.");
  if (!(await rateLimit("change-password", [session.uid], 5, 900))) return fail(TOO_MANY);
  const current = String(fd.get("currentPassword") ?? "");
  try {
    await signInWithPassword(session.email, current);
  } catch {
    return fail("Your current password is incorrect.", { currentPassword: "Incorrect password" });
  }
  await adminAuth().updateUser(session.uid, { password: p.data.password });
  await adminAuth().revokeRefreshTokens(session.uid);
  const { idToken } = await signInWithPassword(session.email, p.data.password);
  await startSession(idToken);
  return ok("Password updated. Other devices have been signed out.");
}
