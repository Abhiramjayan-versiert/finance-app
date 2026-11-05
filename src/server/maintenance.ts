import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dueOccurrences, nextOccurrence } from "@/lib/finance/recurrence";
import { addDaysISO, daysBetween, lastMonths, monthLabel, periodRange, type ISODate } from "@/lib/finance/dates";
import { budgetAppliesTo, computeBudgetUsage, spentForBudget } from "@/lib/finance/budgets";
import { formatMoney, percent } from "@/lib/finance/money";
import { earnedAchievements, type AchievementStats } from "@/lib/finance/achievements";
import { monthlySeries, trackingStreak } from "@/lib/finance/analytics";
import { computeGoalPlan } from "@/lib/finance/goals";
import { addMonthsISO } from "@/lib/finance/dates";
import type { NotificationPrefs, RecurringTransaction } from "@/types/database";

/**
 * Maintenance routines shared by the per-user sync (RLS client) and the daily
 * cron job (service-role client). Every query filters on user_id explicitly
 * so the same code is safe under both clients.
 */

type Client = SupabaseClient;

// ---------------------------------------------------------------------------
// Recurring transactions — idempotent thanks to UNIQUE(recurring_id, occurrence_date)
// ---------------------------------------------------------------------------
export async function materializeRecurring(client: Client, userId: string, today: ISODate): Promise<number> {
  const { data: rules, error } = await client
    .from("recurring_transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .lte("start_date", today);
  if (error || !rules?.length) return 0;
  let created = 0;
  for (const r of rules as RecurringTransaction[]) {
    if (r.last_generated_date && r.last_generated_date >= today) continue;
    const dates = dueOccurrences({ frequency: r.frequency, interval: r.interval_count, startDate: r.start_date, endDate: r.end_date }, r.last_generated_date, today, 366);
    if (!dates.length) continue;
    const rows = dates.map((d) => ({
      user_id: userId,
      type: r.type,
      status: "completed",
      title: r.title,
      amount_minor: r.amount_minor,
      currency: r.currency,
      income_category_id: r.income_category_id,
      expense_category_id: r.expense_category_id,
      occurred_on: d,
      payment_method: r.payment_method,
      merchant: r.merchant,
      source: r.source,
      notes: r.notes,
      is_recurring: true,
      recurring_id: r.id,
      occurrence_date: d,
    }));
    const ins = await client.from("transactions").upsert(rows, { onConflict: "recurring_id,occurrence_date", ignoreDuplicates: true }).select("id");
    if (ins.error) continue;
    created += ins.data?.length ?? 0;
    await client.from("recurring_transactions").update({ last_generated_date: dates[dates.length - 1] }).eq("id", r.id).eq("user_id", userId);
  }
  return created;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
interface Draft {
  type: string;
  dedupe_key: string;
  vars: Record<string, string>;
  link: string;
  fallbackTitle: string;
  fallbackBody: string;
}

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

export function rollForwardDueDate(due: ISODate, frequency: "weekly" | "monthly" | "quarterly" | "yearly", today: ISODate): ISODate {
  let d = due;
  for (let i = 0; d < today && i < 1000; i++) {
    d = frequency === "weekly" ? addDaysISO(d, 7) : addMonthsISO(d, frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12);
  }
  return d;
}

export async function generateNotifications(client: Client, userId: string, opts: { today: ISODate; currency: string; locale: string; prefs: NotificationPrefs }): Promise<number> {
  const { today, currency, locale, prefs } = opts;
  const m = (v: number) => formatMoney(v, currency, { locale });
  const drafts: Draft[] = [];
  const month = periodRange("month", today);
  const monthKey = today.slice(0, 7);

  const [budgets, expenses, expCats, goals, goalProgress, debts, recurring, savingsAccounts, savingsBal, templates] = await Promise.all([
    prefs.budget_warnings ? client.from("budgets").select("*").eq("user_id", userId).is("deleted_at", null) : Promise.resolve({ data: [] }),
    prefs.budget_warnings ? client.from("transactions").select("amount_minor, expense_category_id, occurred_on").eq("user_id", userId).eq("type", "expense").is("deleted_at", null).gte("occurred_on", `${today.slice(0, 4)}-01-01`).lte("occurred_on", today) : Promise.resolve({ data: [] }),
    client.from("expense_categories").select("id, parent_id").eq("user_id", userId),
    client.from("financial_goals").select("*").eq("user_id", userId).is("deleted_at", null).in("status", ["not_started", "active", "completed"]),
    client.from("goal_progress").select("*").eq("user_id", userId),
    prefs.emi_reminders ? client.from("debts").select("*").eq("user_id", userId).is("deleted_at", null).is("closed_at", null) : Promise.resolve({ data: [] }),
    prefs.recurring_reminders ? client.from("recurring_transactions").select("*").eq("user_id", userId).eq("is_active", true).is("deleted_at", null) : Promise.resolve({ data: [] }),
    prefs.milestones ? client.from("savings_accounts").select("*").eq("user_id", userId).is("deleted_at", null).not("target_amount_minor", "is", null) : Promise.resolve({ data: [] }),
    client.from("savings_account_balances").select("*").eq("user_id", userId),
    client.from("notification_templates").select("key, title_template, body_template, is_active"),
  ]);

  const childrenOf = new Map<string, string[]>();
  for (const c of (expCats.data ?? []) as Array<{ id: string; parent_id: string | null }>) if (c.parent_id) childrenOf.set(c.parent_id, [...(childrenOf.get(c.parent_id) ?? []), c.id]);

  // Budget warnings
  for (const b of (budgets.data ?? []) as Array<{ id: string; name: string; period: "monthly" | "yearly"; expense_category_id: string | null; amount_minor: number; thresholds: number[]; start_date: string; end_date: string | null }>) {
    const range = b.period === "monthly" ? month : periodRange("year", today);
    if (!budgetAppliesTo(b, range.from, range.to)) continue;
    const spent = spentForBudget(b, (expenses.data ?? []) as never, range.from, range.to, childrenOf);
    const usage = computeBudgetUsage(b.amount_minor, spent, b.thresholds);
    if (usage.crossedThreshold !== null) {
      const periodKey = b.period === "monthly" ? monthKey : today.slice(0, 4);
      drafts.push({
        type: "budget_warning",
        dedupe_key: `budget:${b.id}:${periodKey}:${usage.crossedThreshold}`,
        vars: { budget: b.name, percent: String(Math.round(usage.utilizationPct)), period: b.period === "monthly" ? monthLabel(monthKey) : today.slice(0, 4) },
        link: "/budgets",
        fallbackTitle: `Budget alert: ${b.name}`,
        fallbackBody: `You have used ${Math.round(usage.utilizationPct)}% of your ${b.name} budget.`,
      });
    }
  }

  // Goals: deadlines & completion
  const saved = new Map(((goalProgress.data ?? []) as Array<{ goal_id: string; saved_minor: number }>).map((p) => [p.goal_id, Number(p.saved_minor)]));
  for (const g of (goals.data ?? []) as Array<{ id: string; name: string; target_amount_minor: number; target_date: string; status: string; completed_at: string | null }>) {
    const s = saved.get(g.id) ?? 0;
    if (s >= g.target_amount_minor) {
      if (prefs.milestones) drafts.push({ type: "goal_completed", dedupe_key: `goal-complete:${g.id}`, vars: { goal: g.name }, link: `/goals/${g.id}`, fallbackTitle: `Goal completed: ${g.name}`, fallbackBody: "Congratulations! You reached your target." });
      if (g.status !== "completed") await client.from("financial_goals").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", g.id).eq("user_id", userId);
      continue;
    }
    if (!prefs.goal_deadlines) continue;
    const days = daysBetween(today, g.target_date);
    const bucket = days < 0 ? "overdue" : days <= 7 ? "d7" : days <= 30 ? "d30" : null;
    if (bucket) {
      const plan = computeGoalPlan({ targetMinor: g.target_amount_minor, savedMinor: s, today, targetDate: g.target_date });
      drafts.push({ type: "goal_deadline", dedupe_key: `goal:${g.id}:${bucket}`, vars: { goal: g.name, date: g.target_date, remaining: m(plan.remainingMinor) }, link: `/goals/${g.id}`, fallbackTitle: `Goal deadline approaching: ${g.name}`, fallbackBody: `You still need ${m(plan.remainingMinor)}.` });
    }
  }

  // EMI due within 3 days
  for (const d of (debts.data ?? []) as Array<{ id: string; name: string; emi_minor: number | null; next_due_date: string | null; payment_frequency: "weekly" | "monthly" | "quarterly" | "yearly" }>) {
    if (!d.next_due_date) continue;
    const due = rollForwardDueDate(d.next_due_date, d.payment_frequency, today);
    const days = daysBetween(today, due);
    if (days >= 0 && days <= 3) {
      drafts.push({ type: "emi_due", dedupe_key: `emi:${d.id}:${due}`, vars: { debt: d.name, amount: d.emi_minor ? m(d.emi_minor) : "your EMI", date: due }, link: "/debts", fallbackTitle: `EMI due soon: ${d.name}`, fallbackBody: `Payment due on ${due}.` });
    }
  }

  // Recurring transactions in the next 2 days
  for (const r of (recurring.data ?? []) as RecurringTransaction[]) {
    const next = nextOccurrence({ frequency: r.frequency, interval: r.interval_count, startDate: r.start_date, endDate: r.end_date }, addDaysISO(today, -1));
    if (next && next > today && daysBetween(today, next) <= 2) {
      drafts.push({ type: "recurring_upcoming", dedupe_key: `rec:${r.id}:${next}`, vars: { type: r.type, title: r.title, amount: m(r.amount_minor), date: next }, link: "/transactions?view=recurring", fallbackTitle: `Upcoming recurring ${r.type}: ${r.title}`, fallbackBody: `${m(r.amount_minor)} on ${next}.` });
    }
  }

  // Savings milestones
  const bal = new Map(((savingsBal.data ?? []) as Array<{ account_id: string; balance_minor: number }>).map((b) => [b.account_id, Number(b.balance_minor)]));
  for (const a of (savingsAccounts.data ?? []) as Array<{ id: string; name: string; target_amount_minor: number }>) {
    const p = percent(bal.get(a.id) ?? 0, a.target_amount_minor);
    const hit = [100, 75, 50].find((t) => p >= t);
    if (hit) drafts.push({ type: "savings_milestone", dedupe_key: `savings:${a.id}:${hit}`, vars: { account: a.name, percent: String(hit) }, link: "/savings", fallbackTitle: "Savings milestone reached", fallbackBody: `${a.name} reached ${hit}% of its target.` });
  }

  // Monthly summary for the previous month (first 5 days of a month)
  if (prefs.monthly_summary && Number(today.slice(8, 10)) <= 5) {
    const prev = lastMonths(2, today)[0];
    const { data: prevTx } = await client.from("transactions").select("type, status, amount_minor, occurred_on").eq("user_id", userId).is("deleted_at", null).gte("occurred_on", `${prev}-01`).lte("occurred_on", `${prev}-31`);
    if (prevTx && prevTx.length) {
      const [row] = monthlySeries(prevTx as never, 1, `${prev}-15`);
      const rate = row.incomeMinor > 0 ? Math.round(((row.incomeMinor - row.expenseMinor) / row.incomeMinor) * 100) : 0;
      drafts.push({ type: "monthly_summary", dedupe_key: `summary:${prev}`, vars: { month: monthLabel(prev), income: m(row.incomeMinor), expenses: m(row.expenseMinor), rate: String(rate) }, link: "/reports", fallbackTitle: `Your ${monthLabel(prev)} summary`, fallbackBody: `Income ${m(row.incomeMinor)}, expenses ${m(row.expenseMinor)}.` });
    }
  }

  if (!drafts.length) return 0;
  const tpl = new Map(((templates.data ?? []) as Array<{ key: string; title_template: string; body_template: string; is_active: boolean }>).map((t) => [t.key, t]));
  const rows = drafts
    .filter((d) => tpl.get(d.type)?.is_active !== false)
    .map((d) => {
      const t = tpl.get(d.type);
      return {
        user_id: userId,
        type: d.type,
        title: (t ? render(t.title_template, d.vars) : d.fallbackTitle).slice(0, 200),
        body: (t ? render(t.body_template, d.vars) : d.fallbackBody).slice(0, 2000),
        link: d.link,
        dedupe_key: d.dedupe_key,
      };
    });
  const res = await client.from("notifications").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
  return res.data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export async function computeAchievementStats(client: Client, userId: string, today: ISODate, minorFactor: number): Promise<AchievementStats> {
  const yearAgo = addDaysISO(today, -400);
  const [txCounts, incomeCount, goals, goalProgress, savingsBal, debtBal, invCount, recentTx, budgets, activityRows] = await Promise.all([
    client.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("type", "expense").is("deleted_at", null),
    client.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("type", "income").is("deleted_at", null),
    client.from("financial_goals").select("id, target_amount_minor, savings_account_id, category, status").eq("user_id", userId).is("deleted_at", null),
    client.from("goal_progress").select("*").eq("user_id", userId),
    client.from("savings_account_balances").select("*").eq("user_id", userId),
    client.from("debt_balances").select("*").eq("user_id", userId),
    client.from("investments").select("id", { count: "exact", head: true }).eq("user_id", userId).is("deleted_at", null),
    client.from("transactions").select("type, status, amount_minor, occurred_on, created_at, expense_category_id").eq("user_id", userId).is("deleted_at", null).gte("occurred_on", yearAgo).limit(5000),
    client.from("budgets").select("*").eq("user_id", userId).is("deleted_at", null).is("expense_category_id", null).eq("period", "monthly"),
    client.from("savings_accounts").select("id, kind").eq("user_id", userId).is("deleted_at", null),
  ]);
  const progress = new Map(((goalProgress.data ?? []) as Array<{ goal_id: string; saved_minor: number }>).map((p) => [p.goal_id, Number(p.saved_minor)]));
  const goalRows = (goals.data ?? []) as Array<{ id: string; target_amount_minor: number; savings_account_id: string | null; category: string }>;
  const unlinkedSaved = goalRows.filter((g) => !g.savings_account_id).reduce((s, g) => s + (progress.get(g.id) ?? 0), 0);
  const bucketTotal = ((savingsBal.data ?? []) as Array<{ balance_minor: number }>).reduce((s, b) => s + Number(b.balance_minor), 0);
  const txs = (recentTx.data ?? []) as Array<{ type: "income" | "expense"; status: "completed" | "expected"; amount_minor: number; occurred_on: string; created_at: string }>;
  const streak = trackingStreak(txs.map((t) => t.created_at.slice(0, 10)), today);
  const series = monthlySeries(txs, 13, today).slice(0, -1); // complete months only
  const bestRate = Math.max(0, ...series.filter((s) => s.incomeMinor > 0).map((s) => ((s.incomeMinor - s.expenseMinor) / s.incomeMinor) * 100));
  const overall = ((budgets.data ?? []) as Array<{ amount_minor: number; start_date: string; end_date: string | null }>)[0];
  const monthsWithinBudget = overall
    ? series.filter((s) => s.expenseMinor > 0 && `${s.month}-01` >= overall.start_date.slice(0, 8) + "01" && s.expenseMinor <= overall.amount_minor).length
    : 0;
  const avgExpense = series.filter((s) => s.expenseMinor > 0).slice(-3);
  const avgMonthlyExpense = avgExpense.length ? avgExpense.reduce((s, r) => s + r.expenseMinor, 0) / avgExpense.length : 0;
  const emergencyIds = new Set(((activityRows.data ?? []) as Array<{ id: string; kind: string }>).filter((a) => a.kind === "emergency").map((a) => a.id));
  const emergencyBucket = ((savingsBal.data ?? []) as Array<{ account_id: string; balance_minor: number }>).filter((b) => emergencyIds.has(b.account_id)).reduce((s, b) => s + Number(b.balance_minor), 0);
  const emergencyGoals = goalRows.filter((g) => g.category === "emergency_fund" && !g.savings_account_id).reduce((s, g) => s + (progress.get(g.id) ?? 0), 0);
  const debtRows = (debtBal.data ?? []) as Array<{ outstanding_minor: number }>;
  return {
    expenseCount: txCounts.count ?? 0,
    incomeCount: incomeCount.count ?? 0,
    goalCount: goalRows.length,
    completedGoalCount: goalRows.filter((g) => (progress.get(g.id) ?? 0) >= g.target_amount_minor).length,
    totalSavedMinor: bucketTotal + unlinkedSaved,
    minorFactor,
    streakDays: streak,
    monthsWithinBudget,
    bestMonthlySavingsRatePct: Number.isFinite(bestRate) ? bestRate : 0,
    emergencyFundMonths: avgMonthlyExpense > 0 ? (emergencyBucket + emergencyGoals) / avgMonthlyExpense : 0,
    debtCount: debtRows.length,
    outstandingDebtMinor: debtRows.reduce((s, d) => s + Number(d.outstanding_minor), 0),
    investmentCount: invCount.count ?? 0,
  };
}

export async function awardAchievements(client: Client, userId: string, stats: AchievementStats, notify: boolean): Promise<string[]> {
  const codes = earnedAchievements(stats);
  if (!codes.length) return [];
  const [{ data: all }, { data: mine }] = await Promise.all([
    client.from("achievements").select("id, code, name, description"),
    client.from("user_achievements").select("achievement_id").eq("user_id", userId),
  ]);
  const have = new Set((mine ?? []).map((r: { achievement_id: string }) => r.achievement_id));
  const toAward = ((all ?? []) as Array<{ id: string; code: string; name: string; description: string }>).filter((a) => codes.includes(a.code) && !have.has(a.id));
  if (!toAward.length) return [];
  await client.from("user_achievements").upsert(toAward.map((a) => ({ user_id: userId, achievement_id: a.id })), { onConflict: "user_id,achievement_id", ignoreDuplicates: true });
  if (notify) {
    await client.from("notifications").upsert(
      toAward.map((a) => ({ user_id: userId, type: "achievement_unlocked", title: `Achievement unlocked: ${a.name}`, body: a.description, link: "/achievements", dedupe_key: `ach:${a.code}` })),
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
  }
  return toAward.map((a) => a.code);
}

// ---------------------------------------------------------------------------
// Net-worth snapshot for the current month (upsert, so one row per month)
// ---------------------------------------------------------------------------
export async function upsertSnapshot(client: Client, userId: string, today: ISODate, nw: { totalAssetsMinor: number; totalLiabilitiesMinor: number; netWorthMinor: number; assets: unknown; liabilities: unknown }) {
  await client.from("financial_snapshots").upsert(
    {
      user_id: userId,
      snapshot_month: `${today.slice(0, 7)}-01`,
      total_assets_minor: nw.totalAssetsMinor,
      total_liabilities_minor: nw.totalLiabilitiesMinor,
      net_worth_minor: nw.netWorthMinor,
      breakdown: { assets: nw.assets, liabilities: nw.liabilities, as_of: today },
    },
    { onConflict: "user_id,snapshot_month" },
  );
}
