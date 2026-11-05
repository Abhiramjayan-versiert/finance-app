"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env.server";
import { notificationPrefsSchema, preferencesSchema, profileSchema } from "@/lib/validation/schemas";
import { dbErrorMessage, fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { formDataToObject } from "@/lib/validation/common";
import { CURRENCIES } from "@/lib/finance/money";
import { rateLimit } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/security/errors";

export async function updateProfileAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(profileSchema, fd);
    if (!p.ok) return p.result;
    const avatar = fd.get("avatarPath");
    const supabase = await createClient();
    const patch: Record<string, unknown> = { full_name: p.data.fullName, country: p.data.country };
    if (typeof avatar === "string" && avatar && avatar.startsWith(`${ws.userId}/`) && !avatar.includes("..")) patch.avatar_url = avatar;
    const { error } = await supabase.from("profiles").update(patch).eq("id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    await supabase.auth.updateUser({ data: { full_name: p.data.fullName } });
    revalidatePath("/", "layout");
    return ok("Profile saved");
  }, "updateProfile");
}

export async function updatePreferencesAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const currency = String(fd.get("currency") ?? ws.settings.currency).toUpperCase();
    if (!CURRENCIES[currency]) return fail("Unsupported currency", { currency: "Choose a supported currency" });
    const p = parseForm(preferencesSchema(currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("user_settings")
      .update({ currency: d.currency, locale: d.locale, timezone: d.timezone, date_format: d.dateFormat, fy_start_month: d.fyStartMonth, theme: d.theme, default_payment_method: d.defaultPaymentMethod, opening_balance_minor: d.openingBalance, net_worth_cash_source: d.netWorthCashSource })
      .eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/", "layout");
    return ok(d.currency !== ws.settings.currency ? "Preferences saved. Existing amounts are now displayed in the new currency (no conversion is applied)." : "Preferences saved");
  }, "updatePreferences");
}

export async function updateNotificationPrefsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const parsed = notificationPrefsSchema.safeParse(formDataToObject(fd));
    if (!parsed.success) return fail("Invalid preferences");
    const supabase = await createClient();
    const { error } = await supabase.from("user_settings").update({ notification_prefs: parsed.data }).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/settings");
    return ok("Notification preferences saved");
  }, "updateNotificationPrefs");
}

const deleteSchema = z.object({ confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }), password: z.string().min(1, "Enter your password") });

/** Permanently deletes the account and all financial data (cascade), after re-authentication. */
export async function deleteAccountAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const result = await guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(deleteSchema, fd);
    if (!p.ok) return p.result;
    if (!(await rateLimit("delete-account", [ws.userId], 5, 3600))) return fail("Too many attempts. Try again later.");
    if (!isServiceRoleConfigured()) return fail("Account deletion is not configured on this server. Contact support.");
    if (ws.roles.includes("super_admin")) return fail("Super admin accounts cannot be self-deleted. Transfer the role first.");
    const supabase = await createClient();
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: ws.email, password: p.data.password });
    if (authErr) return fail("Password is incorrect.", { password: "Password is incorrect" });
    const admin = createAdminClient();
    // Remove stored files first (storage is not covered by the database cascade).
    for (const bucket of ["receipts", "avatars", "goal-images"]) {
      const { data: files } = await admin.storage.from(bucket).list(ws.userId, { limit: 1000 });
      if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${ws.userId}/${f.name}`));
    }
    await admin.from("audit_logs").insert({ actor_id: null, actor_email: null, action: "user.self_deleted", target_type: "user", target_id: ws.userId, metadata: {} });
    const { error } = await admin.auth.admin.deleteUser(ws.userId);
    if (error) {
      await logServerError(error, "deleteAccount", ws.userId);
      return fail("We could not delete your account. Please try again.");
    }
    await supabase.auth.signOut();
    return ok("deleted");
  }, "deleteAccount");
  if (result.ok) redirect("/?accountDeleted=1");
  return result;
}
