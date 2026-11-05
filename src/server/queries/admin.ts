import "server-only";
import { adminAuth, getStore } from "@/lib/firebase/admin";
import type { UserDoc } from "@/server/data/users";
import { addDaysISO } from "@/lib/finance/dates";

/**
 * Admin read models: account metadata and aggregate counts only. These never
 * read users/{uid}/… financial subcollections.
 */
export interface AdminStats {
  total_users: number;
  verified_users: number;
  suspended_users: number;
  new_users_7d: number;
  new_users_30d: number;
  dau: number;
  wau: number;
  mau: number;
  errors_24h: number;
  errors_7d: number;
}

export interface AdminUserRow {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "suspended";
  roles: string[];
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function distinctActive(sinceDay: string) {
  const rows = await getStore().list<{ user_id: string }>("activity", { where: [["day", ">=", sinceDay]] });
  return new Set(rows.map((r) => r.user_id)).size;
}

export async function getAdminStats(): Promise<AdminStats> {
  const s = getStore();
  const [total, suspended, n7, n30, e24, e7, dau, wau, mau, verified] = await Promise.all([
    s.count("users"),
    s.count("users", [["status", "==", "suspended"]]),
    s.count("users", [["created_at", ">=", daysAgoIso(7)]]),
    s.count("users", [["created_at", ">=", daysAgoIso(30)]]),
    s.count("app_errors", [["created_at", ">=", daysAgoIso(1)]]),
    s.count("app_errors", [["created_at", ">=", daysAgoIso(7)]]),
    distinctActive(today()),
    distinctActive(addDaysISO(today(), -6)),
    distinctActive(addDaysISO(today(), -29)),
    countVerified(),
  ]);
  return { total_users: total, verified_users: verified, suspended_users: suspended, new_users_7d: n7, new_users_30d: n30, dau, wau, mau, errors_24h: e24, errors_7d: e7 };
}

async function countVerified() {
  let n = 0;
  let token: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await adminAuth().listUsers(1000, token);
    n += page.users.filter((u) => u.emailVerified).length;
    token = page.pageToken;
    if (!token) break;
  }
  return n;
}

export async function getRegistrationSeries(days = 90) {
  const from = addDaysISO(today(), -(days - 1));
  const [users, activity] = await Promise.all([
    getStore().list<{ created_at: string }>("users", { where: [["created_at", ">=", `${from}T00:00:00`]] }),
    getStore().list<{ day: string }>("activity", { where: [["day", ">=", from]] }),
  ]);
  const out: Array<{ day: string; registrations: number; active_users: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysISO(from, i);
    out.push({ day: d, registrations: users.filter((u) => u.created_at.slice(0, 10) === d).length, active_users: activity.filter((a) => a.day === d).length });
  }
  return out;
}

export async function listUsers(search: string, status: string, page: number, size = 25) {
  const docs = await getStore().list<UserDoc>("users", { orderBy: ["created_at", "desc"], limit: 5000 });
  const authUsers = new Map<string, { verified: boolean; lastSignIn: string | null }>();
  // Fetch auth metadata in batches of 100 (Admin SDK limit).
  for (let i = 0; i < docs.length; i += 100) {
    const r = await adminAuth().getUsers(docs.slice(i, i + 100).map((d) => ({ uid: d.id })));
    for (const u of r.users) authUsers.set(u.uid, { verified: u.emailVerified, lastSignIn: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null });
  }
  const q = search.trim().toLowerCase();
  const cutoff = daysAgoIso(30);
  const rows: AdminUserRow[] = docs
    .filter((d) => !d.deleted_at)
    .map((d) => ({ id: d.id, full_name: d.full_name, email: d.email, status: d.status, roles: d.roles ?? [], email_confirmed: authUsers.get(d.id)?.verified ?? false, created_at: d.created_at, last_sign_in_at: authUsers.get(d.id)?.lastSignIn ?? null, last_seen_at: d.last_seen_at }))
    .filter((u) => !q || u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q))
    .filter((u) => !status || (status === "suspended" ? u.status === "suspended" : status === "active" ? u.status === "active" : status === "unverified" ? !u.email_confirmed : !u.last_seen_at || u.last_seen_at < cutoff));
  return { rows: rows.slice((page - 1) * size, page * size), total: rows.length };
}
