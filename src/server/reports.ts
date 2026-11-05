import "server-only";
import type { Workspace } from "@/lib/auth";
import type { Cell } from "@/lib/export/csv";
import { fromMinor, formatMoney } from "@/lib/finance/money";
import { eachDay, lastMonths, monthKey, monthLabel, type DateRange } from "@/lib/finance/dates";
import { incomeBySource, rollupCategoryId, spendingSummary, totals } from "@/lib/finance/analytics";
import { budgetAppliesTo, computeBudgetUsage, spentForBudget } from "@/lib/finance/budgets";
import { ASSET_CLASS_LABEL, portfolioTotals } from "@/lib/finance/investments";
import { GOAL_STATUS_LABEL } from "@/lib/finance/goals";
import { PAYMENT_METHOD_LABEL, DEBT_KIND_LABEL, GOAL_CATEGORY_LABEL } from "@/lib/labels";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { getBudgets, getCategories, getDebts, getGoals, getInvestments, getNetWorth, getSavings, getSnapshots, getTransactions } from "./queries/finance";

export const REPORT_TYPES = [
  { value: "transactions", label: "All transactions" },
  { value: "daily-expenses", label: "Daily expense report" },
  { value: "monthly-expenses", label: "Monthly expense report" },
  { value: "annual-expenses", label: "Annual expense report" },
  { value: "income", label: "Income report" },
  { value: "savings", label: "Savings report" },
  { value: "investments", label: "Investment report" },
  { value: "budgets", label: "Budget report" },
  { value: "debts", label: "Debt report" },
  { value: "net-worth", label: "Net worth report" },
  { value: "goals", label: "Goal achievement report" },
] as const;
export type ReportType = (typeof REPORT_TYPES)[number]["value"];

export interface Report {
  title: string;
  subtitle: string;
  columns: string[];
  rows: Cell[][];
  summary: Array<[string, string]>;
  chart?: { kind: "bars" | "trend"; points: Array<{ label: string; valueMinor: number }> };
  /** Second series for comparison charts (income vs expense). */
  compare?: Array<{ label: string; incomeMinor: number; expenseMinor: number }>;
}

/** Builds a report from the user's records (RLS-scoped). Money columns are major-unit decimal numbers. */
export async function buildReport(ws: Workspace, type: ReportType, range: DateRange, categoryId?: string): Promise<Report> {
  const cur = ws.settings.currency;
  const m = (v: number) => formatMoney(v, cur, { locale: ws.settings.locale });
  const num = (v: number) => Number(fromMinor(v, cur));
  const sub = `${range.from} to ${range.to} · amounts in ${cur}`;
  const cats = await getCategories();
  const catMap = new Map([...cats.expense, ...cats.income].map((c) => [c.id, c]));
  const catIds = categoryId ? new Set([categoryId, ...(cats.childrenOf.get(categoryId) ?? [])]) : null;
  const inCat = (id: string | null) => !catIds || (id !== null && catIds.has(id));

  switch (type) {
    case "transactions": {
      const txs = (await getTransactions({ from: range.from, to: range.to })).filter((t) => inCat(t.expense_category_id ?? t.income_category_id));
      const t = totals(txs);
      return {
        title: "Transactions",
        subtitle: sub,
        columns: ["Date", "Type", "Status", "Title", "Category", "Payment method", "Merchant/Source", "Amount", "Notes"],
        rows: txs.map((x) => [x.occurred_on, x.type, x.status, x.title, catMap.get(x.expense_category_id ?? x.income_category_id ?? "")?.name ?? "Uncategorised", PAYMENT_METHOD_LABEL[x.payment_method], x.merchant ?? x.source ?? "", num(x.type === "income" ? x.amount_minor : -x.amount_minor), x.notes ?? ""]),
        summary: [["Income received", m(t.incomeMinor)], ["Expected income", m(t.expectedIncomeMinor)], ["Expenses", m(t.expenseMinor)], ["Net", m(t.netMinor)], ["Entries", String(txs.length)]],
      };
    }
    case "daily-expenses":
    case "monthly-expenses":
    case "annual-expenses": {
      const txs = (await getTransactions({ type: "expense", from: range.from, to: range.to })).filter((t) => inCat(t.expense_category_id));
      const s = spendingSummary(txs, range, cats.expense);
      const summary: Array<[string, string]> = [["Total spending", m(s.totalMinor)], ["Average per day", m(s.averageDailyMinor)], ["Transactions", String(s.count)], ["Highest day", s.highestDay ? `${s.highestDay.date} (${m(s.highestDay.amountMinor)})` : "—"], ["Top category", s.topCategory ? `${s.topCategory.name} (${m(s.topCategory.amountMinor)})` : "—"]];
      if (type === "daily-expenses") {
        const byDay = new Map<string, number[]>();
        for (const t of txs) byDay.set(t.occurred_on, [...(byDay.get(t.occurred_on) ?? []), t.amount_minor]);
        const days = eachDay(range).filter((d) => byDay.has(d));
        return { title: "Daily expense report", subtitle: sub, columns: ["Date", "Transactions", "Total spent"], rows: days.map((d) => [d, byDay.get(d)!.length, num(byDay.get(d)!.reduce((a, b) => a + b, 0))]), summary, chart: { kind: "trend", points: s.byDay.map((d) => ({ label: d.date.slice(5), valueMinor: d.amountMinor })) } };
      }
      // Month × category matrix (annual = full months in range).
      const months = [...new Set(eachDay(range).map(monthKey))];
      const top = s.byCategory.map((c) => c.id);
      const cell = (mk: string, cid: string | null) => txs.filter((t) => monthKey(t.occurred_on) === mk && rollupCategoryId(t.expense_category_id, new Map(cats.expense.map((c) => [c.id, c]))) === cid).reduce((a, t) => a + t.amount_minor, 0);
      return {
        title: type === "annual-expenses" ? "Annual expense report" : "Monthly expense report",
        subtitle: sub,
        columns: ["Month", ...s.byCategory.map((c) => c.name), "Total"],
        rows: months.map((mk) => [monthLabel(mk), ...top.map((cid) => num(cell(mk, cid))), num(txs.filter((t) => monthKey(t.occurred_on) === mk).reduce((a, t) => a + t.amount_minor, 0))]),
        summary,
        chart: { kind: "bars", points: months.map((mk) => ({ label: monthLabel(mk), valueMinor: txs.filter((t) => monthKey(t.occurred_on) === mk).reduce((a, t) => a + t.amount_minor, 0) })) },
      };
    }
    case "income": {
      const txs = (await getTransactions({ type: "income", from: range.from, to: range.to })).filter((t) => inCat(t.income_category_id));
      const t = totals(txs);
      const sources = incomeBySource(txs, range, cats.income);
      return {
        title: "Income report",
        subtitle: sub,
        columns: ["Source category", "Received", "Share %"],
        rows: sources.map((s) => [s.name, num(s.amountMinor), s.pct]),
        summary: [["Received", m(t.incomeMinor)], ["Expected (not received)", m(t.expectedIncomeMinor)], ["Entries", String(txs.length)]],
        chart: { kind: "bars", points: [...new Set(eachDay(range).map(monthKey))].map((mk) => ({ label: monthLabel(mk), valueMinor: txs.filter((x) => x.status === "completed" && monthKey(x.occurred_on) === mk).reduce((a, x) => a + x.amount_minor, 0) })) },
      };
    }
    case "savings": {
      const s = await getSavings();
      const names = new Map(s.accounts.map((a) => [a.id, a.name]));
      const txs = s.transactions.filter((t) => t.occurred_on >= range.from && t.occurred_on <= range.to);
      const dep = txs.filter((t) => t.type === "deposit").reduce((a, t) => a + t.amount_minor, 0);
      const wd = txs.filter((t) => t.type === "withdrawal").reduce((a, t) => a + t.amount_minor, 0);
      return {
        title: "Savings report",
        subtitle: sub,
        columns: ["Date", "Account", "Type", "Amount", "From/to cash", "Note"],
        rows: txs.map((t) => [t.occurred_on, names.get(t.account_id) ?? "", t.type.replace("_", " "), num(t.amount_minor), t.affects_cash ? "Yes" : "No", t.note ?? ""]),
        summary: [["Total balance now", m(s.totalMinor)], ["Deposits in period", m(dep)], ["Withdrawals in period", m(wd)], ["Net saved", m(dep - wd)], ...s.accounts.map((a) => [a.name, m(a.balanceMinor)] as [string, string])],
      };
    }
    case "investments": {
      const inv = await getInvestments();
      const p = portfolioTotals(inv.map((i) => ({ asset_type: i.asset_type, investedMinor: i.investedMinor, currentValueMinor: i.current_value_minor })));
      return {
        title: "Investment report",
        subtitle: `As of ${ws.today} · values as last entered · ${cur}`,
        columns: ["Investment", "Asset type", "Units", "Invested", "Current value", "Unrealised P/L", "Return %", "Value as of"],
        rows: inv.map((i) => [i.name, ASSET_CLASS_LABEL[i.asset_type], i.units || "", num(i.investedMinor), num(i.current_value_minor), num(i.pnlMinor), i.investedMinor ? Math.round((i.pnlMinor / i.investedMinor) * 10000) / 100 : 0, i.current_value_as_of ?? ""]),
        summary: [["Invested", m(p.investedMinor)], ["Current value", m(p.currentValueMinor)], ["Unrealised P/L", m(p.unrealizedPnlMinor)], ["Return", `${p.returnPct}%`]],
        chart: { kind: "bars", points: p.allocation.map((a) => ({ label: a.label, valueMinor: a.valueMinor })) },
      };
    }
    case "budgets": {
      const [budgets, txs] = await Promise.all([getBudgets(), getTransactions({ type: "expense", from: `${lastMonths(12, range.to)[0]}-01`, to: range.to })]);
      const months = [...new Set(eachDay(range).map(monthKey))];
      const rows: Cell[][] = [];
      for (const b of budgets.filter((x) => x.period === "monthly")) {
        for (const mk of months) {
          const r = { from: `${mk}-01`, to: `${mk}-31` };
          if (!budgetAppliesTo(b, r.from, r.to)) continue;
          const u = computeBudgetUsage(b.amount_minor, spentForBudget(b, txs, r.from, r.to, cats.childrenOf), b.thresholds);
          rows.push([monthLabel(mk), b.name, num(u.budgetMinor), num(u.spentMinor), num(u.remainingMinor), u.utilizationPct, u.level]);
        }
      }
      return { title: "Budget report", subtitle: sub, columns: ["Month", "Budget", "Budgeted", "Spent", "Remaining", "Utilised %", "Status"], rows, summary: [["Budgets", String(budgets.length)], ["Months over budget", String(rows.filter((r) => r[6] === "exceeded").length)]] };
    }
    case "debts": {
      const debts = await getDebts();
      return {
        title: "Debt report",
        subtitle: `As of ${ws.today} · ${cur}`,
        columns: ["Loan", "Type", "Interest %", "Principal", "Outstanding", "Principal repaid", "Interest paid", "EMI", "Payments"],
        rows: debts.map((d) => [d.name, DEBT_KIND_LABEL[d.kind], d.interest_rate, num(d.principal_minor), num(d.outstandingMinor), num(d.principalPaidMinor), num(d.interestPaidMinor), d.emi_minor ? num(d.emi_minor) : "", d.payments.length]),
        summary: [["Total outstanding", m(debts.reduce((s, d) => s + d.outstandingMinor, 0))], ["Interest paid", m(debts.reduce((s, d) => s + d.interestPaidMinor, 0))]],
      };
    }
    case "net-worth": {
      const [nw, snaps] = await Promise.all([getNetWorth(ws.today, ws.settings.net_worth_cash_source), getSnapshots(60)]);
      const inRange = snaps.filter((s) => s.snapshot_month >= range.from.slice(0, 8) + "01" && s.snapshot_month <= range.to);
      return {
        title: "Net worth report",
        subtitle: sub,
        columns: ["Month", "Total assets", "Total liabilities", "Net worth"],
        rows: inRange.map((s) => [monthLabel(s.snapshot_month.slice(0, 7)), num(s.total_assets_minor), num(s.total_liabilities_minor), num(s.net_worth_minor)]),
        summary: [["Net worth now", m(nw.netWorthMinor)], ["Assets", m(nw.totalAssetsMinor)], ["Liabilities", m(nw.totalLiabilitiesMinor)], ...nw.assets.map((a) => [`Asset · ${a.name}`, m(a.valueMinor)] as [string, string]), ...nw.liabilities.map((a) => [`Liability · ${a.name}`, m(a.valueMinor)] as [string, string])],
        chart: { kind: "trend", points: inRange.map((s) => ({ label: monthLabel(s.snapshot_month.slice(0, 7)), valueMinor: s.net_worth_minor })) },
      };
    }
    case "goals": {
      const goals = await getGoals(ws.today);
      return {
        title: "Goal achievement report",
        subtitle: `As of ${ws.today} · ${cur}`,
        columns: ["Goal", "Category", "Priority", "Status", "Target", "Saved", "Progress %", "Target date", "Monthly required"],
        rows: goals.map((g) => [g.name, GOAL_CATEGORY_LABEL[g.category], g.priority, GOAL_STATUS_LABEL[g.derivedStatus], num(g.target_amount_minor), num(g.savedMinor), g.plan.progressPct, g.target_date, num(g.plan.monthlyRequiredMinor)]),
        summary: [["Goals", String(goals.length)], ["Completed", String(goals.filter((g) => g.derivedStatus === "completed").length)], ["Total target", m(goals.reduce((s, g) => s + g.target_amount_minor, 0))], ["Total saved", m(goals.reduce((s, g) => s + g.savedMinor, 0))]],
      };
    }
  }
}

/** Complete personal data export (data portability). */
export async function exportAllData(ws: Workspace) {
  const store = getStore();
  const cols = ["income_categories", "expense_categories", "transactions", "recurring_transactions", "budgets", "financial_goals", "goal_contributions", "savings_accounts", "savings_transactions", "investments", "investment_transactions", "debts", "debt_payments", "assets", "liabilities", "financial_snapshots", "notifications", "user_achievements"];
  const profile = await store.get(userPath(ws.userId));
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id: ws.userId, currency: ws.settings.currency, note: "Money fields ending in _minor are integer minor units (e.g. paise).", profile };
  for (const c of cols) out[c] = await store.list(userPath(ws.userId, c));
  return out;
}
