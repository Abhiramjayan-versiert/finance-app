import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { adminAuth, getStore } from "@/lib/firebase/admin";
import { readSessionCookie } from "@/lib/firebase/session";
import { userPath } from "@/lib/firebase/store";
import { todayInTimeZone } from "@/lib/finance/dates";
import { DEFAULT_SETTINGS, type UserDoc } from "@/server/data/users";
import type { AppRole, Profile, UserSettings } from "@/types/database";

export interface SessionUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

/** Verifies the httpOnly session cookie with Firebase (including revocation/disabled checks). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookie = await readSessionCookie();
  if (!cookie) return null;
  try {
    const d = await adminAuth().verifySessionCookie(cookie, true);
    return { uid: d.uid, email: d.email ?? "", emailVerified: d.email_verified === true };
  } catch {
    return null;
  }
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

export const loadWorkspace = cache(async (uid: string, email: string): Promise<Workspace | null> => {
  const doc = await getStore().get<UserDoc>(userPath(uid));
  if (!doc) return null;
  const settings: UserSettings = { user_id: uid, ...DEFAULT_SETTINGS, ...(doc.settings ?? {}), notification_prefs: { ...DEFAULT_SETTINGS.notification_prefs, ...(doc.settings?.notification_prefs ?? {}) } };
  const roles = (doc.roles ?? []).filter((r): r is AppRole => ["super_admin", "admin", "support"].includes(r));
  const { roles: _r, settings: _s, ...profile } = doc;
  return {
    userId: uid,
    email: email || doc.email,
    profile: { ...(profile as Omit<Profile, "id">), id: uid },
    settings,
    roles,
    isAdmin: roles.includes("super_admin") || roles.includes("admin"),
    today: todayInTimeZone(settings.timezone),
  };
});

/** Loads the signed-in user's workspace or redirects (verification + suspension enforced). */
export const requireWorkspace = cache(async (): Promise<Workspace> => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.emailVerified) redirect(`/verify?email=${encodeURIComponent(user.email)}`);
  const ws = await loadWorkspace(user.uid, user.email);
  if (!ws) redirect("/login?error=profile");
  if (ws.profile.status === "suspended" || ws.profile.deleted_at) redirect("/suspended");
  return ws;
});

export class AuthError extends Error {}

/** For server actions: returns the workspace or throws (never redirects mid-mutation). */
export async function actionWorkspace(): Promise<Workspace> {
  const user = await getSessionUser();
  if (!user || !user.emailVerified) throw new AuthError("Your session has expired. Please sign in again.");
  const ws = await loadWorkspace(user.uid, user.email);
  if (!ws || ws.profile.status === "suspended") throw new AuthError("Your account is not available. Please sign in again.");
  return ws;
}

/** Admin gate: verifies the role on the server for every admin render/action. */
export async function requireAdmin(minRole: "admin" | "super_admin" = "admin"): Promise<Workspace> {
  const ws = await requireWorkspace();
  const ok = minRole === "super_admin" ? ws.roles.includes("super_admin") : ws.isAdmin;
  if (!ok) redirect("/dashboard");
  return ws;
}
