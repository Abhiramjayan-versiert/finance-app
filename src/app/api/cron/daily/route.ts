import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv, isEmailConfigured } from "@/lib/env.server";
import { isBackendConfigured, publicEnv } from "@/lib/env";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { generateNotifications, materializeRecurring } from "@/server/maintenance";
import { todayInTimeZone } from "@/lib/finance/dates";
import { sendEmail } from "@/lib/email";
import { logServerError } from "@/lib/security/errors";
import type { UserDoc } from "@/server/data/users";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * Daily job (Vercel Cron): catches up recurring transactions, generates
 * reminders for every active user, and emails unsent notifications to users who
 * opted in. Emails are marked sent only after the provider accepts them.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isBackendConfigured()) return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  const store = getStore();
  const started = Date.now();
  const stats = { users: 0, recurring: 0, notifications: 0, emailed: 0, emailFailed: 0, errors: 0 };
  let cursor: string | undefined;
  while (Date.now() - started < 240_000) {
    const users = await store.list<UserDoc>("users", { orderBy: ["__id__", "asc"], limit: 200, startAfter: cursor });
    if (!users.length) break;
    cursor = users.at(-1)!.id;
    for (const u of users) {
      if (u.status !== "active" || u.deleted_at) continue;
      stats.users++;
      try {
        const s = u.settings;
        const today = todayInTimeZone(s?.timezone ?? "Asia/Kolkata");
        stats.recurring += await materializeRecurring(store, u.id, today);
        if (!s) continue;
        stats.notifications += await generateNotifications(store, u.id, { today, currency: s.currency, locale: s.locale, prefs: s.notification_prefs });
        if (s.notification_prefs?.email && isEmailConfigured() && u.email) {
          const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
          const pending = (await store.list<{ title: string; body: string; link: string | null; read_at: string | null; emailed_at: string | null }>(userPath(u.id, "notifications"), { where: [["created_at", ">=", since]] })).filter((n) => !n.read_at && !n.emailed_at).slice(0, 20);
          if (pending.length) {
            const text = pending.map((n) => `• ${n.title}\n  ${n.body}${n.link ? `\n  ${publicEnv.siteUrl}${n.link}` : ""}`).join("\n\n") + `\n\nManage notifications: ${publicEnv.siteUrl}/settings#notifications`;
            if (await sendEmail(u.email, pending.length === 1 ? pending[0].title : `You have ${pending.length} FINANCE OS updates`, text)) {
              const at = new Date().toISOString();
              for (const n of pending) await store.update(userPath(u.id, "notifications", n.id), { emailed_at: at });
              stats.emailed++;
            } else stats.emailFailed++;
          }
        }
      } catch (e) {
        stats.errors++;
        await logServerError(e, "cron/daily", u.id, "cron");
      }
    }
    if (users.length < 200) break;
  }
  // Housekeeping: expired rate-limit buckets.
  for (const r of await store.list("rate_limits", { where: [["expires_at", "<", new Date().toISOString()]], limit: 500 })) await store.delete(`rate_limits/${r.id}`);
  return NextResponse.json({ ok: true, ...stats, ms: Date.now() - started });
}
