import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv, isServiceRoleConfigured, isEmailConfigured } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateNotifications, materializeRecurring } from "@/server/maintenance";
import { todayInTimeZone } from "@/lib/finance/dates";
import { sendEmail } from "@/lib/email";
import { logServerError } from "@/lib/security/errors";
import { publicEnv } from "@/lib/env";
import type { NotificationPrefs } from "@/types/database";

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
 * reminders for every active user, and emails unsent notifications to users
 * who opted in. Emails are marked as sent only after the provider accepts them.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isServiceRoleConfigured()) return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  const admin = createAdminClient();
  const started = Date.now();
  const stats = { users: 0, recurring: 0, notifications: 0, emailed: 0, emailFailed: 0, errors: 0 };

  for (let page = 0; Date.now() - started < 240_000; page++) {
    const { data: users, error } = await admin.from("profiles").select("id, email, status, user_settings(currency, locale, timezone, notification_prefs)").eq("status", "active").is("deleted_at", null).order("created_at").range(page * 200, page * 200 + 199);
    if (error) break;
    if (!users?.length) break;
    for (const u of users) {
      stats.users++;
      try {
        const s = (Array.isArray(u.user_settings) ? u.user_settings[0] : u.user_settings) as { currency: string; locale: string; timezone: string; notification_prefs: NotificationPrefs } | null;
        const today = todayInTimeZone(s?.timezone ?? "Asia/Kolkata");
        stats.recurring += await materializeRecurring(admin, u.id, today);
        if (!s) continue;
        stats.notifications += await generateNotifications(admin, u.id, { today, currency: s.currency, locale: s.locale, prefs: s.notification_prefs });
        if (s.notification_prefs?.email && isEmailConfigured() && u.email) {
          const { data: pending } = await admin.from("notifications").select("id, title, body, link").eq("user_id", u.id).is("emailed_at", null).is("read_at", null).gte("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString()).limit(20);
          if (pending?.length) {
            const text = pending.map((n) => `• ${n.title}\n  ${n.body}${n.link ? `\n  ${publicEnv.siteUrl}${n.link}` : ""}`).join("\n\n") + `\n\nManage notifications: ${publicEnv.siteUrl}/settings#notifications`;
            const sent = await sendEmail(u.email, pending.length === 1 ? pending[0].title : `You have ${pending.length} FINANCE OS updates`, text);
            if (sent) {
              await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", pending.map((n) => n.id)).eq("user_id", u.id);
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
  return NextResponse.json({ ok: true, ...stats, ms: Date.now() - started });
}
