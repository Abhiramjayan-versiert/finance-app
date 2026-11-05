"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { emailOnlySchema, loginSchema, otpSchema, registerSchema, resetPasswordSchema, changePasswordSchema } from "@/lib/validation/schemas";
import { fail, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/security/errors";

const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

export async function registerAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(registerSchema, fd);
  if (!p.ok) return p.result;
  const { fullName, email, password } = p.data;
  const ip = await clientIp();
  if (!(await rateLimit("register", [ip], 10, 3600))) return fail(TOO_MANY);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, terms_accepted: "true" },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/dashboard`,
    },
  });
  if (error) {
    if (/registrations are currently disabled/i.test(error.message)) return fail("New registrations are currently disabled.");
    if (error.code === "weak_password") return fail(error.message, { password: error.message });
    if (error.status === 429) return fail(TOO_MANY);
    await logServerError(error, "auth/register", null, "auth");
    return fail("We could not create your account. Please try again.");
  }
  // Supabase returns a user with no identities when the email already exists
  // (to avoid account enumeration). Treat both cases the same for the user.
  if (data.session) {
    // Email confirmation disabled in the project — still require verification UX.
    redirect("/dashboard");
  }
  redirect(`/verify?email=${encodeURIComponent(email)}&sent=1`);
}

export async function verifyOtpAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(otpSchema, fd);
  if (!p.ok) return p.result;
  const { email, token } = p.data;
  const ip = await clientIp();
  if (!(await rateLimit("verify", [email], 10, 900)) || !(await rateLimit("verify-ip", [ip], 30, 900))) return fail(TOO_MANY);

  const supabase = await createClient();
  let { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) {
    // Codes sent via "resend" or magic-link templates use the generic email type.
    const retry = await supabase.auth.verifyOtp({ email, token, type: "email" });
    error = retry.error;
  }
  if (error) {
    const expired = /expired/i.test(error.message);
    return fail(expired ? "This code has expired. Request a new one." : "That code is not valid. Check the email and try again.", { token: expired ? "Code expired" : "Invalid code" });
  }
  redirect("/dashboard?welcome=1");
}

export async function resendOtpAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(emailOnlySchema, fd);
  if (!p.ok) return p.result;
  const { email } = p.data;
  const ip = await clientIp();
  if (!(await rateLimit("resend", [email], 3, 900)) || !(await rateLimit("resend-ip", [ip], 10, 900))) return fail("You can request a new code a few times every 15 minutes. Please wait and try again.");
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/dashboard` } });
  if (error) {
    if (error.status === 429) return fail("Please wait a minute before requesting another code.");
    await logServerError(error, "auth/resend", null, "auth");
    return fail("We could not send a new code right now. Please try again shortly.");
  }
  return ok("If an unverified account exists for this email, a new code has been sent.");
}

export async function loginAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(loginSchema, fd);
  if (!p.ok) return p.result;
  const { email, password } = p.data;
  const ip = await clientIp();
  if (!(await rateLimit("login", [email], 10, 900)) || !(await rateLimit("login-ip", [ip], 50, 900))) return fail(TOO_MANY);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") redirect(`/verify?email=${encodeURIComponent(email)}`);
    if (/banned/i.test(error.message) || error.code === "user_banned") return fail("This account has been suspended. Contact support for help.");
    return fail("Incorrect email or password.");
  }
  if (!data.user.email_confirmed_at) redirect(`/verify?email=${encodeURIComponent(email)}`);
  redirect(safeNext(fd.get("next")));
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?signedOut=1");
}

export async function forgotPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(emailOnlySchema, fd);
  if (!p.ok) return p.result;
  const { email } = p.data;
  const ip = await clientIp();
  if (!(await rateLimit("recover", [email], 3, 900)) || !(await rateLimit("recover-ip", [ip], 10, 900))) return fail(TOO_MANY);
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${publicEnv.siteUrl}/auth/confirm?next=/settings/security` });
  if (error && error.status !== 429) await logServerError(error, "auth/recover", null, "auth");
  // Same response whether or not the account exists (no enumeration).
  redirect(`/reset-password?email=${encodeURIComponent(email)}`);
}

export async function resetPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(resetPasswordSchema, fd);
  if (!p.ok) return p.result;
  const { email, token, password } = p.data;
  if (!(await rateLimit("reset", [email], 10, 900))) return fail(TOO_MANY);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
  if (error) return fail(/expired/i.test(error.message) ? "This code has expired. Request a new one." : "That code is not valid.", { token: "Invalid or expired code" });
  const upd = await supabase.auth.updateUser({ password });
  if (upd.error) return fail(upd.error.message.includes("different") ? "Choose a password different from your current one." : "Could not update your password.", { password: upd.error.message });
  redirect("/dashboard?passwordReset=1");
}

export async function changePasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const p = parseForm(changePasswordSchema, fd);
  if (!p.ok) return p.result;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("Your session has expired. Please sign in again.");
  if (!(await rateLimit("change-password", [data.user.id], 5, 900))) return fail(TOO_MANY);
  const { error } = await supabase.auth.updateUser({ password: p.data.password });
  if (error) {
    if (error.code === "reauthentication_needed" || /reauthenticat/i.test(error.message)) return fail("For security, sign out and use 'Forgot password' to set a new password.");
    return fail(error.message.includes("different") ? "Choose a password different from your current one." : "Could not update your password.");
  }
  return ok("Password updated.");
}
