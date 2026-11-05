import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currencyInfo } from "@/lib/finance/money";
import type { Workspace } from "@/lib/auth";
import { logServerError } from "@/lib/security/errors";
import { awardAchievements, computeAchievementStats, generateNotifications, materializeRecurring, upsertSnapshot } from "./maintenance";
import { getNetWorth } from "./queries/finance";

/**
 * Runs on each app render: records activity, catches up recurring
 * transactions and (once per day) refreshes notifications, achievements and
 * the monthly net-worth snapshot. Failures never block the page.
 */
export async function syncWorkspace(ws: Workspace) {
  try {
    const supabase = await createClient();
    const [{ data: firstToday }] = await Promise.all([supabase.rpc("record_activity"), materializeRecurring(supabase, ws.userId, ws.today)]);
    if (firstToday) await dailyRefresh(ws);
  } catch (e) {
    await logServerError(e, "sync", ws.userId);
  }
}

export async function dailyRefresh(ws: Workspace) {
  const supabase = await createClient();
  const factor = 10 ** currencyInfo(ws.settings.currency).exponent;
  await generateNotifications(supabase, ws.userId, { today: ws.today, currency: ws.settings.currency, locale: ws.settings.locale, prefs: ws.settings.notification_prefs });
  const stats = await computeAchievementStats(supabase, ws.userId, ws.today, factor);
  await awardAchievements(supabase, ws.userId, stats, ws.settings.notification_prefs.milestones);
  const nw = await getNetWorth(ws.today, ws.settings.net_worth_cash_source);
  await upsertSnapshot(supabase, ws.userId, ws.today, nw);
}
