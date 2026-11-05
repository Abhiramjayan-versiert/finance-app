"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionWorkspace } from "@/lib/auth";
import { adminAuth, getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { signInWithPassword } from "@/lib/firebase/identity";
import { endSession } from "@/lib/firebase/session";
import { notificationPrefsSchema, preferencesSchema, profileSchema } from "@/lib/validation/schemas";
import { fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { formDataToObject } from "@/lib/validation/common";
import { CURRENCIES } from "@/lib/finance/money";
import { rateLimit } from "@/lib/security/rate-limit";
import { audit } from "@/lib/security/audit";

export async function updateProfileAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(profileSchema, fd);
    if (!p.ok) return p.result;
    const avatar = fd.get("avatarPath");
    const patch: Record<string, unknown> = { full_name: p.data.fullName, country: p.data.country };
    if (typeof avatar === "string" && avatar && avatar.startsWith(`${ws.userId}/`)) patch.avatar_url = avatar;
    await getStore().update(userPath(ws.userId), patch);
    await adminAuth().updateUser(ws.userId, { displayName: p.data.fullName });
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
    const { user_id: _u, ...current } = ws.settings;
    await getStore().update(userPath(ws.userId), {
      settings: { ...current, currency: d.currency, locale: d.locale, timezone: d.timezone, date_format: d.dateFormat, fy_start_month: d.fyStartMonth, theme: d.theme, default_payment_method: d.defaultPaymentMethod, opening_balance_minor: d.openingBalance, net_worth_cash_source: d.netWorthCashSource },
    });
    revalidatePath("/", "layout");
    return ok(d.currency !== ws.settings.currency ? "Preferences saved. Existing amounts are now displayed in the new currency (no conversion is applied)." : "Preferences saved");
  }, "updatePreferences");
}

export async function updateNotificationPrefsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const parsed = notificationPrefsSchema.safeParse(formDataToObject(fd));
    if (!parsed.success) return fail("Invalid preferences");
    const { user_id: _u, ...current } = ws.settings;
    await getStore().update(userPath(ws.userId), { settings: { ...current, notification_prefs: parsed.data } });
    revalidatePath("/settings");
    return ok("Notification preferences saved");
  }, "updateNotificationPrefs");
}

const deleteSchema = z.object({ confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }), password: z.string().min(1, "Enter your password") });

/** Permanently deletes the account and every document under users/{uid}, after re-authentication. */
export async function deleteAccountAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const result = await guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(deleteSchema, fd);
    if (!p.ok) return p.result;
    if (!(await rateLimit("delete-account", [ws.userId], 5, 3600))) return fail("Too many attempts. Try again later.");
    if (ws.roles.includes("super_admin")) return fail("Super admin accounts cannot be self-deleted. Transfer the role first.");
    try {
      await signInWithPassword(ws.email, p.data.password);
    } catch {
      return fail("Password is incorrect.", { password: "Password is incorrect" });
    }
    await audit({ id: null, email: null }, "user.self_deleted", { type: "user", id: ws.userId });
    await getStore().deleteTree(userPath(ws.userId));
    await adminAuth().deleteUser(ws.userId);
    await endSession();
    return ok("deleted");
  }, "deleteAccount");
  if (result.ok) redirect("/?accountDeleted=1");
  return result;
}
