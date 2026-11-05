import "server-only";
import { createHash } from "node:crypto";
import { AlreadyExistsError, userPath, type Store } from "@/lib/firebase/store";
import { nextOccurrence } from "@/lib/finance/recurrence";
import { addDaysISO, addMonthsISO, daysBetween, lastMonths, monthLabel, periodRange, type ISODate } from "@/lib/finance/dates";
import { budgetAppliesTo, computeBudgetUsage, spentFromRollups } from "@/lib/finance/budgets";
import { formatMoney, percent } from "@/lib/finance/money";
import { earnedAchievements, type AchievementStats } from "@/lib/finance/achievements";
import { trackingStreak } from "@/lib/finance/analytics";
import { computeGoalPlan } from "@/lib/finance/goals";
import { ACHIEVEMENTS, DEFAULT_TEMPLATES } from "@/server/data/defaults";
import type { MonthRollup } from "@/server/data/ledger";
import type { Budget, Category, Debt, NotificationPrefs, RecurringTransaction } from "@/types/database";

export { materializeRecurring } from "@/server/data/ledger";

/**
 * Maintenance routines shared by the per-user sync and the daily cron job.
 * Every path is rooted at users/{uid}.
 */

const live = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);

export function rollForwardDueDate(due: ISODate, frequency: "weekly" | "monthly" | "quarterly" | "yearly", today: ISODate): ISODate {
  let d = due;
  for (let i = 0; d < today && i < 1000; i++) d = frequency === "weekly" ? addDaysISO(d, 7) : addMonthsISO(d, frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12);
  return d;
}

const notifId = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 32);

/** Inserts notifications once per dedupe key. Returns how many were new. */
export async function pushNotifications(store: Store, uid: string, items: Array<{ type: string; title: string; body: string; link: string; dedupe_key: string }>) {
  let created = 0;
  for (const n of items) {
    try {
      await store.create(userPath(uid, "notifications", notifId(n.dedupe_key)), { ...n, user_id: uid, read_at: null, emailed_at: null, created_at: new Date().toISOString() });
      created++;
    } catch (e) {
      if (!(e instanceof AlreadyExistsError)) throw e;
    }
  }
  return created;
}

async function templates(store: Store) {
  const custom = await store.list<{ title_template: string; body_template: string; is_active: boolean }>("notification_templates");
  const map = new Map<string, { title: string; body: string; active: boolean }>(Object.entries(DEFAULT_TEMPLATES).map(([k, v]) => [k, { ...v, active: true }]));
  for (const t of custom) map.set(t.id, { title: t.title_template, body: t.body_template, active: t.is_active !== false });
  return map;
}

const render = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");

export async function generateNotifications(store: Store, uid: string, opts: { today: ISODate; currency: string; locale: string; prefs: NotificationPrefs }): Promise<number> {
  const { today, currency, locale, prefs } = opts;
  const m = (v: number) => formatMoney(v, currency, { locale });
  const drafts: Array<{ type: string; key: string; vars: Record<string, string>; link: string }> = [];
  const monthKey = today.slice(0, 7);
  const p = (c: string) => userPath(uid, c);

  const [budgets, cats, rollups, goals, accounts, debts, recurring] = await Promise.all([
    prefs.budget_warnings ? store.list<Budget & { deleted_at?: string | null }>(p("budgets")) : Promise.resolve([]),
    store.list<Category>(p("expense_categories")),
    store.list<MonthRollup & { month: string }>(p("months"), { where: [["month", ">=", `${today.slice(0, 4)}-01`], ["month", "<=", monthKey]] }),
    store.list<{ name: string; target_amount_minor: number; target_date: string; status: string; saved_minor: number; savings_account_id: string | null; deleted_at?: string | null }>(p("financial_goals")),
    store.list<{ name: string; target_amount_minor: number | null; balance_minor: number; deleted_at?: string | null }>(p("savings_accounts")),
    prefs.emi_reminders ? store.list<Debt & { deleted_at?: string | null }>(p("debts")) : Promise.resolve([]),
    prefs.recurring_reminders ? store.list<RecurringTransaction & { deleted_at?: string | null }>(p("recurring_transactions"), { where: [["is_active", "==", true]] }) : Promise.resolve([]),
  ]);
  const childrenOf = new Map<string, string[]>();
  for (const c of cats) if (c.parent_id) childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c.id]);
  const roll = new Map(rollups.map((r) => [r.month ?? r.id, r]));
  const balances = new Map(live(accounts).map((a) => [a.id, a.balance_minor ?? 0]));

  for (const b of live(budgets)) {
    const range = b.period === "monthly" ? periodRange("month", today) : periodRange("year", today);
    if (!budgetAppliesTo(b, range.from, range.to)) continue;
    const spent = spentFromRollups(b, roll, range.from.slice(0, 7), range.to.slice(0, 7), childrenOf);
    const usage = computeBudgetUsage(b.amount_minor, spent, b.thresholds);
    if (usage.crossedThreshold !== null) {
      const periodKey = b.period === "monthly" ? monthKey : today.slice(0, 4);
      drafts.push({ type: "budget_warning", key: `budget:${b.id}:${periodKey}:${usage.crossedThreshold}`, vars: { budget: b.name, percent: String(Math.round(usage.utilizationPct)), period: b.period === "monthly" ? monthLabel(monthKey) : today.slice(0, 4) }, link: "/budgets" });
    }
  }

  for (const g of live(goals)) {
    if (["paused", "cancelled"].includes(g.status)) continue;
    const saved = g.savings_account_id ? balances.get(g.savings_account_id) ?? 0 : g.saved_minor ?? 0;
    if (saved >= g.target_amount_minor) {
      if (prefs.milestones) drafts.push({ type: "goal_completed", key: `goal-complete:${g.id}`, vars: { goal: g.name }, link: `/goals/${g.id}` });
      if (g.status !== "completed") await store.update(userPath(uid, "financial_goals", g.id), { status: "completed", completed_at: new Date().toISOString() });
      continue;
    }
    if (!prefs.goal_deadlines) continue;
    const days = daysBetween(today, g.target_date);
    const bucket = days < 0 ? "overdue" : days <= 7 ? "d7" : days <= 30 ? "d30" : null;
    if (bucket) drafts.push({ type: "goal_deadline", key: `goal:${g.id}:${bucket}`, vars: { goal: g.name, date: g.target_date, remaining: m(computeGoalPlan({ targetMinor: g.target_amount_minor, savedMinor: saved, today, targetDate: g.target_date }).remainingMinor) }, link: `/goals/${g.id}` });
  }

  for (const d of live(debts)) {
    if (!d.next_due_date || d.closed_at) continue;
    const due = rollForwardDueDate(d.next_due_date, d.payment_frequency, today);
    const days = daysBetween(today, due);
    if (days >= 0 && days <= 3) drafts.push({ type: "emi_due", key: `emi:${d.id}:${due}`, vars: { debt: d.name, amount: d.emi_minor ? m(d.emi_minor) : "your EMI", date: due }, link: "/debts" });
  }

  for (const r of live(recurring)) {
    const next = nextOccurrence({ frequency: r.frequency, interval: r.interval_count, startDate: r.start_date, endDate: r.end_date }, addDaysISO(today, -1));
    if (next && next > today && daysBetween(today, next) <= 2) drafts.push({ type: "recurring_upcoming", key: `rec:${r.id}:${next}`, vars: { type: r.type, title: r.title, amount: m(r.amount_minor), date: next }, link: "/transactions?view=recurring" });
  }

  if (prefs.milestones) {
    for (const a of live(accounts)) {
      if (!a.target_amount_minor) continue;
      const hit = [100, 75, 50].find((t) => percent(a.balance_minor ?? 0, a.target_amount_minor!) >= t);
      if (hit) drafts.push({ type: "savings_milestone", key: `savings:${a.id}:${hit}`, vars: { account: a.name, percent: String(hit) }, link: "/savings" });
    }
  }

  if (prefs.monthly_summary && Number(today.slice(8, 10)) <= 5) {
    const prev = lastMonths(2, today)[0];
    const r = (await store.get<MonthRollup>(userPath(uid, "months", prev))) ?? null;
    if (r && (r.income_minor || r.expense_minor)) {
      const rate = r.income_minor > 0 ? Math.round(((r.income_minor - r.expense_minor) / r.income_minor) * 100) : 0;
      drafts.push({ type: "monthly_summary", key: `summary:${prev}`, vars: { month: monthLabel(prev), income: m(r.income_minor), expenses: m(r.expense_minor), rate: String(rate) }, link: "/reports" });
    }
  }

  if (!drafts.length) return 0;
  const tpl = await templates(store);
  return pushNotifications(
    store,
    uid,
    drafts.filter((d) => tpl.get(d.type)?.active !== false).map((d) => {
      const t = tpl.get(d.type)!;
      return { type: d.type, title: render(t.title, d.vars).slice(0, 200), body: render(t.body, d.vars).slice(0, 2000), link: d.link, dedupe_key: d.key };
    }),
  );
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export async function computeAchievementStats(store: Store, uid: string, today: ISODate, minorFactor: number): Promise<AchievementStats> {
  const p = (c: string) => userPath(uid, c);
  const months = lastMonths(13, today);
  const [expenseCount, incomeCount, goals, accounts, debts, invCount, recent, rollups, budgets] = await Promise.all([
    store.count(p("transactions"), [["type", "==", "expense"]]),
    store.count(p("transactions"), [["type", "==", "income"]]),
    store.list<{ target_amount_minor: number; saved_minor: number; savings_account_id: string | null; category: string; deleted_at?: string | null }>(p("financial_goals")),
    store.list<{ kind: string; balance_minor: number; deleted_at?: string | null }>(p("savings_accounts")),
    store.list<{ opening_outstanding_minor: number; principal_paid_minor?: number; deleted_at?: string | null }>(p("debts")),
    store.count(p("investments")),
    store.list<{ created_at: string }>(p("transactions"), { where: [["created_at", ">=", `${addDaysISO(today, -40)}T00:00:00`]] }),
    store.list<MonthRollup & { month: string }>(p("months"), { where: [["month", ">=", months[0]], ["month", "<=", months.at(-1)!]] }),
    store.list<Budget & { deleted_at?: string | null }>(p("budgets")),
  ]);
  const bal = new Map(live(accounts).map((a) => [a.id, a.balance_minor ?? 0]));
  const g = live(goals);
  const saved = (x: (typeof g)[number]) => (x.savings_account_id ? bal.get(x.savings_account_id) ?? 0 : x.saved_minor ?? 0);
  const totalSaved = [...bal.values()].reduce((s, v) => s + v, 0) + g.filter((x) => !x.savings_account_id).reduce((s, x) => s + (x.saved_minor ?? 0), 0);
  const complete = rollups.filter((r) => (r.month ?? r.id) < today.slice(0, 7));
  const best = Math.max(0, ...complete.filter((r) => r.income_minor > 0).map((r) => ((r.income_minor - r.expense_minor) / r.income_minor) * 100));
  const overall = live(budgets).find((b) => b.period === "monthly" && !b.expense_category_id);
  const within = overall ? complete.filter((r) => r.expense_minor > 0 && (r.month ?? r.id) >= overall.start_date.slice(0, 7) && r.expense_minor <= overall.amount_minor).length : 0;
  const lastThree = complete.filter((r) => r.expense_minor > 0).slice(-3);
  const avgExpense = lastThree.length ? lastThree.reduce((s, r) => s + r.expense_minor, 0) / lastThree.length : 0;
  const emergency = live(accounts).filter((a) => a.kind === "emergency").reduce((s, a) => s + (a.balance_minor ?? 0), 0) + g.filter((x) => x.category === "emergency_fund" && !x.savings_account_id).reduce((s, x) => s + (x.saved_minor ?? 0), 0);
  const d = live(debts);
  return {
    expenseCount,
    incomeCount,
    goalCount: g.length,
    completedGoalCount: g.filter((x) => saved(x) >= x.target_amount_minor).length,
    totalSavedMinor: totalSaved,
    minorFactor,
    streakDays: trackingStreak(recent.map((r) => r.created_at.slice(0, 10)), today),
    monthsWithinBudget: within,
    bestMonthlySavingsRatePct: Number.isFinite(best) ? best : 0,
    emergencyFundMonths: avgExpense > 0 ? emergency / avgExpense : 0,
    debtCount: d.length,
    outstandingDebtMinor: d.reduce((s, x) => s + x.opening_outstanding_minor - (x.principal_paid_minor ?? 0), 0),
    investmentCount: invCount,
  };
}

export async function awardAchievements(store: Store, uid: string, stats: AchievementStats, notify: boolean): Promise<string[]> {
  const codes = earnedAchievements(stats);
  const awarded: string[] = [];
  for (const code of codes) {
    try {
      await store.create(userPath(uid, "user_achievements", code), { user_id: uid, code, awarded_at: new Date().toISOString() });
      awarded.push(code);
    } catch (e) {
      if (!(e instanceof AlreadyExistsError)) throw e;
    }
  }
  if (notify && awarded.length) {
    await pushNotifications(store, uid, awarded.map((code) => {
      const a = ACHIEVEMENTS.find((x) => x.code === code)!;
      return { type: "achievement_unlocked", title: `Achievement unlocked: ${a.name}`, body: a.description, link: "/achievements", dedupe_key: `ach:${code}` };
    }));
  }
  return awarded;
}

export async function upsertSnapshot(store: Store, uid: string, today: ISODate, nw: { totalAssetsMinor: number; totalLiabilitiesMinor: number; netWorthMinor: number; assets: unknown; liabilities: unknown }) {
  const month = `${today.slice(0, 7)}-01`;
  await store.set(userPath(uid, "financial_snapshots", month.slice(0, 7)), {
    user_id: uid,
    snapshot_month: month,
    total_assets_minor: nw.totalAssetsMinor,
    total_liabilities_minor: nw.totalLiabilitiesMinor,
    net_worth_minor: nw.netWorthMinor,
    breakdown: { assets: nw.assets, liabilities: nw.liabilities, as_of: today },
    updated_at: new Date().toISOString(),
  });
}
