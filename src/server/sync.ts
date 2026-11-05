import "server-only";
import { getStore } from "@/lib/firebase/admin";
import { AlreadyExistsError, userPath } from "@/lib/firebase/store";
import { currencyInfo } from "@/lib/finance/money";
import type { Workspace } from "@/lib/auth";
import { logServerError } from "@/lib/security/errors";
import { awardAchievements, computeAchievementStats, generateNotifications, materializeRecurring, upsertSnapshot } from "./maintenance";
import { getNetWorth } from "./queries/finance";

/** Records today's activity; returns true on the first visit of the day (UTC). */
async function recordActivity(uid: string): Promise<boolean> {
  const store = getStore();
  const day = new Date().toISOString().slice(0, 10);
  try {
    await store.create(`activity/${day}_${uid}`, { user_id: uid, day, created_at: new Date().toISOString() });
    await store.update(userPath(uid), { last_seen_at: new Date().toISOString() });
    return true;
  } catch (e) {
    if (e instanceof AlreadyExistsError) return false;
    throw e;
  }
}

/**
 * Runs on each app render: catches up recurring transactions and (once per day)
 * refreshes notifications, achievements and the monthly net-worth snapshot.
 * Failures never block the page.
 */
export async function syncWorkspace(ws: Workspace) {
  try {
    const store = getStore();
    const [first] = await Promise.all([recordActivity(ws.userId), materializeRecurring(store, ws.userId, ws.today)]);
    if (first) await dailyRefresh(ws);
  } catch (e) {
    await logServerError(e, "sync", ws.userId);
  }
}

export async function dailyRefresh(ws: Workspace) {
  const store = getStore();
  await generateNotifications(store, ws.userId, { today: ws.today, currency: ws.settings.currency, locale: ws.settings.locale, prefs: ws.settings.notification_prefs });
  const stats = await computeAchievementStats(store, ws.userId, ws.today, 10 ** currencyInfo(ws.settings.currency).exponent);
  await awardAchievements(store, ws.userId, stats, ws.settings.notification_prefs.milestones);
  await upsertSnapshot(store, ws.userId, ws.today, await getNetWorth(ws.today, ws.settings.net_worth_cash_source));
}
