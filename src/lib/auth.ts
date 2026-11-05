import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayInTimeZone } from "@/lib/finance/dates";
import type { AppRole, Profile, UserSettings } from "@/types/database";

const DEFAULT_SETTINGS: Omit<UserSettings, "user_id"> = {
  currency: "INR",
  locale: "en-IN",
  timezone: "Asia/Kolkata",
  date_format: "dd/MM/yyyy",
  fy_start_month: 4,
  theme: "dark",
  opening_balance_minor: 0,
  net_worth_cash_source: "tracked",
  default_payment_method: "upi",
  notification_prefs: { budget_warnings: true, goal_deadlines: true, emi_reminders: true, recurring_reminders: true, monthly_summary: true, milestones: true, email: false },
};

/** The authenticated user (validated against Supabase Auth), or null. */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

export interface Workspace {
  userId: string;
  email: string;
  profile: Profile;
  settings: UserSettings;
  roles: AppRole[];
  isAdmin: boolean;
  today: string;
}

/**
 * Loads the signed-in user's workspace or redirects. Enforces email
 * verification and account suspension on every protected render.
 */
export const requireWorkspace = cache(async (): Promise<Workspace> => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect(`/verify?email=${encodeURIComponent(user.email ?? "")}`);

  const supabase = await createClient();
  const [{ data: profile }, { data: settings }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  if (!profile) redirect("/login?error=profile");
  if (profile.status === "suspended" || profile.deleted_at) redirect("/suspended");

  const merged: UserSettings = { user_id: user.id, ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  merged.notification_prefs = { ...DEFAULT_SETTINGS.notification_prefs, ...(settings?.notification_prefs ?? {}) };
  const roleList = (roles ?? []).map((r) => r.role as AppRole);
  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile: profile as Profile,
    settings: merged,
    roles: roleList,
    isAdmin: roleList.includes("super_admin") || roleList.includes("admin"),
    today: todayInTimeZone(merged.timezone),
  };
});

/** For server actions: returns the workspace or throws (never redirects mid-mutation). */
export async function actionWorkspace(): Promise<Workspace> {
  const user = await getSessionUser();
  if (!user || !user.email_confirmed_at) throw new AuthError("Your session has expired. Please sign in again.");
  return requireWorkspace();
}

export class AuthError extends Error {}

/** Admin gate: verifies the role on the server for every admin render/action. */
export async function requireAdmin(minRole: "admin" | "super_admin" = "admin"): Promise<Workspace> {
  const ws = await requireWorkspace();
  const ok = minRole === "super_admin" ? ws.roles.includes("super_admin") : ws.isAdmin;
  if (!ok) redirect("/dashboard");
  return ws;
}
