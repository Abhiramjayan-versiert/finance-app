import Link from "next/link";
import type { Metadata } from "next";
import { Target } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { getGoals, getSavings, getTransactions } from "@/server/queries/finance";
import { averageMonthlySurplus } from "@/lib/finance/analytics";
import { GOAL_STATUS_LABEL, planGoals } from "@/lib/finance/goals";
import { formatMoney } from "@/lib/finance/money";
import { addDaysISO, formatDisplayDate, lastMonths } from "@/lib/finance/dates";
import { GOAL_CATEGORY_LABEL } from "@/lib/labels";
import { Expandable } from "@/components/shared/expandable";
import { PageHeader } from "@/components/shared/page-header";
import { HELP } from "@/components/shared/page-help";
import { EmptyState, EstimateNote } from "@/components/shared/states";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { NewGoalButton } from "@/components/goals/goal-actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Financial Goals" };

const STATUS_VARIANT = { on_track: "success", completed: "success", at_risk: "warning", active: "accent", not_started: "default", paused: "default", cancelled: "danger" } as const;

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const ws = await requireWorkspace();
  const sp = await searchParams;
  const [goals, savings, txs] = await Promise.all([getGoals(ws.today), getSavings(), getTransactions({ from: `${lastMonths(4, ws.today)[0]}-01`, to: ws.today })]);
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const accounts = savings.accounts.map((a) => ({ id: a.id, name: a.name, balanceMinor: a.balanceMinor, linked: !!a.linkedGoalId }));
  const live = goals.filter((g) => g.derivedStatus !== "cancelled");
  const open = live.filter((g) => g.derivedStatus !== "completed" && g.derivedStatus !== "paused");
  const totalTarget = live.reduce((s, g) => s + g.target_amount_minor, 0);
  const totalSaved = live.reduce((s, g) => s + Math.min(g.savedMinor, g.target_amount_minor), 0);
  const surplus = averageMonthlySurplus(txs, ws.today, 3);
  const plan = planGoals(open.map((g) => ({ id: g.id, name: g.name, priority: g.priority, targetDate: g.target_date, remainingMinor: g.plan.remainingMinor, monthlyRequiredMinor: g.plan.monthlyRequiredMinor })), surplus.surplusMinor, ws.today);
  const upcoming = open.filter((g) => g.target_date <= addDaysISO(ws.today, 90)).sort((a, b) => a.target_date.localeCompare(b.target_date));

  return (
    <>
      <PageHeader help={HELP.goals} title="Goals" description="Save up for the things you want." actions={<NewGoalButton accounts={accounts} defaultOpen={sp.new === "1"} />} />
      {live.length ? (
        <Card className="p-5">
          <p className="text-base">
            You&apos;ve saved <span className="font-semibold tabular">{m(totalSaved)}</span> of <span className="font-semibold tabular">{m(totalTarget)}</span> across {live.length} goal{live.length === 1 ? "" : "s"}.
          </p>
          <Progress className="mt-3 h-3" value={totalTarget ? (totalSaved / totalTarget) * 100 : 0} label="All goals progress" />
          <p className="mt-2 text-sm text-muted">{m(Math.max(0, totalTarget - totalSaved))} to go · {open.length} active · {live.filter((g) => g.derivedStatus === "completed").length} completed</p>
        </Card>
      ) : null}

      {goals.length === 0 ? (
        <EmptyState className="mt-6" icon={Target} title="Plan your first goal" description="Example: a ₹1,80,000 MacBook in 12 months with ₹20,000 already saved needs ₹13,333.34 a month." action={<NewGoalButton accounts={accounts} />} />
      ) : (
        <>
          {upcoming.length ? (
            <p className="mt-4 text-xs text-muted">Upcoming target dates: {upcoming.map((g) => `${g.name} (${formatDisplayDate(g.target_date)})`).join(" · ")}</p>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {goals.map((g) => (
              <Link key={g.id} href={`/goals/${g.id}`} className="group rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full p-5 transition-colors group-hover:border-border-strong">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold">{g.name}</p>
                      <p className="text-sm text-muted">{GOAL_CATEGORY_LABEL[g.category]} · by {formatDisplayDate(g.target_date)}</p>
                    </div>
                    <Badge variant={STATUS_VARIANT[g.derivedStatus]}>{GOAL_STATUS_LABEL[g.derivedStatus]}</Badge>
                  </div>
                  <p className="mt-3 text-base">
                    <span className="font-semibold tabular">{m(g.savedMinor)}</span> <span className="text-muted">of</span> <span className="tabular">{m(g.target_amount_minor)}</span> <span className="text-muted">saved</span>
                  </p>
                  <Progress value={g.plan.progressPct} tone={g.derivedStatus === "at_risk" ? "warning" : g.derivedStatus === "completed" ? "success" : "accent"} className="mt-2 h-3" label={`${g.name}: ${g.plan.progressPct}% saved`} />
                  {g.plan.remainingMinor > 0 ? (
                    <p className="mt-2 text-base font-semibold tabular">{m(g.plan.remainingMinor)} to go</p>
                  ) : (
                    <p className="mt-2 text-base font-semibold text-success">Goal reached 🎉</p>
                  )}
                  {g.plan.remainingMinor > 0 && !["paused", "cancelled"].includes(g.derivedStatus) ? (
                    <p className="mt-1 text-sm text-muted">Save about <span className="font-medium text-foreground tabular">{m(g.plan.monthlyRequiredMinor)}</span> a month to reach it on time.</p>
                  ) : null}
                  {g.etaDate && g.plan.remainingMinor > 0 ? <p className="mt-1 text-sm text-muted">At your current pace: around {formatDisplayDate(g.etaDate, "MMM yyyy")}</p> : null}
                </Card>
              </Link>
            ))}
          </div>
          {open.length ? (
            <Expandable className="mt-4" title="Can I afford all my goals?" description="Checks your goals against what you usually have left each month">
              <div>
                <p className="mb-4 text-sm text-muted">Based on your average money left over (income − spending) in the last 3 full months, shared out by priority and then by deadline.</p>
                <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-card-2 p-3"><p className="text-xs text-muted">Monthly capacity</p><p className={cn("font-semibold tabular", surplus.surplusMinor < 0 && "text-danger")}>{m(surplus.surplusMinor)}</p><p className="text-xs text-muted">{m(surplus.incomeMinor)} in − {m(surplus.expenseMinor)} out</p></div>
                  <div className="rounded-xl bg-card-2 p-3"><p className="text-xs text-muted">Needed for all goals</p><p className="font-semibold tabular">{m(plan.totalRequiredMinor)}/mo</p></div>
                  <div className={cn("rounded-xl p-3", plan.affordable ? "bg-success/10" : "bg-warning/10")}>
                    <p className="text-xs text-muted">{plan.affordable ? "Your income supports all goals" : "Monthly shortfall"}</p>
                    <p className={cn("font-semibold tabular", plan.affordable ? "text-success" : "text-warning")}>{plan.affordable ? "✓ Achievable" : m(plan.shortfallMinor)}</p>
                  </div>
                </div>
                <ol className="space-y-2">
                  {plan.goals.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border p-3 text-sm">
                      <span className="flex size-6 items-center justify-center rounded-full bg-card-2 text-xs font-semibold">{g.rank}</span>
                      <Link href={`/goals/${g.id}`} className="min-w-0 flex-1 font-medium hover:underline">{g.name} <span className="text-xs font-normal capitalize text-muted">· {g.priority} priority</span></Link>
                      <span className="text-xs text-muted tabular">needs {m(g.monthlyRequiredMinor)}/mo · allocated {m(g.allocatedMonthlyMinor)}</span>
                      <Badge variant={g.fullyFunded ? "success" : g.allocatedMonthlyMinor > 0 ? "warning" : "danger"}>
                        {g.fullyFunded ? "Achievable on time" : g.projectedDate ? `~${g.delayMonths} mo late (${formatDisplayDate(g.projectedDate, "MMM yyyy")})` : "Not funded"}
                      </Badge>
                    </li>
                  ))}
                </ol>
                <EstimateNote className="mt-3" />
              </div>
            </Expandable>
          ) : null}

        </>
      )}
    </>
  );
}
