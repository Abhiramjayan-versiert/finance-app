import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { fileUrl } from "@/lib/files/url";
import { getGoals, getSavings } from "@/server/queries/finance";
import { GOAL_STATUS_LABEL, scenarioMonthlyRequired } from "@/lib/finance/goals";
import { formatMoney } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import { GOAL_CATEGORY_LABEL } from "@/lib/labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EstimateNote } from "@/components/shared/states";
import { ContributionHistory, GoalActions } from "@/components/goals/goal-actions";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = { title: "Goal" };

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await requireWorkspace();
  const [goals, savings] = await Promise.all([getGoals(ws.today), getSavings()]);
  const g = goals.find((x) => x.id === id);
  if (!g) notFound();
  const m = (v: number) => formatMoney(v, ws.settings.currency, { locale: ws.settings.locale });
  const accounts = savings.accounts.map((a) => ({ id: a.id, name: a.name, balanceMinor: a.balanceMinor, linked: !!a.linkedGoalId }));
  const linkedAccount = savings.accounts.find((a) => a.id === g.savings_account_id);
  const imageUrl = g.image_path ? fileUrl(g.image_path) : null;
  const input = { targetMinor: g.target_amount_minor, savedMinor: g.savedMinor, today: ws.today, targetDate: g.target_date };
  const scenarios = [-6, -3, 0, 3, 6, 12].map((d) => ({ delta: d, ...scenarioMonthlyRequired(input, d) }));

  return (
    <>
      <Link href="/goals" className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"><ArrowLeft className="size-3" /> All goals</Link>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-5 sm:pt-5">
            <div className="flex flex-col gap-4 sm:flex-row">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={g.name} className="h-32 w-full rounded-lg object-cover sm:w-40" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold">{g.name}</h1>
                  <Badge variant={g.derivedStatus === "at_risk" ? "warning" : g.derivedStatus === "completed" || g.derivedStatus === "on_track" ? "success" : "default"}>{GOAL_STATUS_LABEL[g.derivedStatus]}</Badge>
                  <Badge className="capitalize">{g.priority} priority</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {GOAL_CATEGORY_LABEL[g.category]}{g.product_category ? ` · ${g.product_category}` : ""} · target {formatDisplayDate(g.target_date)}
                  {g.product_url ? <> · <a href={g.product_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-accent hover:underline">Product <ExternalLink className="size-3" /></a></> : null}
                </p>
                {g.description ? <p className="mt-2 text-sm">{g.description}</p> : null}
              </div>
            </div>
            <div className="mt-5 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular">{m(g.savedMinor)}</span>
              <span className="text-sm text-muted tabular">of {m(g.target_amount_minor)} · {g.plan.progressPct}%</span>
            </div>
            <Progress value={g.plan.progressPct} className="mt-2 h-2.5" tone={g.derivedStatus === "at_risk" ? "warning" : "accent"} />
            {linkedAccount ? <p className="mt-2 text-xs text-muted">Funded by savings account <Link href="/savings" className="text-accent">{linkedAccount.name}</Link> — its balance is this goal&apos;s saved amount.</p> : null}
            <div className="mt-5"><GoalActions goal={g} savedMinor={g.savedMinor} accounts={accounts} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Savings required</CardTitle><CardDescription>Remaining ÷ time left</CardDescription></div></CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Remaining amount</dt><dd className="font-semibold tabular">{m(g.plan.remainingMinor)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Monthly ({g.plan.monthsLeft} months)</dt><dd className="font-semibold text-accent tabular">{m(g.plan.monthlyRequiredMinor)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Weekly ({g.plan.weeksLeft} weeks)</dt><dd className="font-semibold tabular">{m(g.plan.weeklyRequiredMinor)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Daily ({g.plan.daysLeft} days)</dt><dd className="font-semibold tabular">{m(g.plan.dailyRequiredMinor)}</dd></div>
              <div className="flex justify-between border-t border-border pt-3"><dt className="text-muted">Your recent pace</dt><dd className="tabular">{m(g.monthlyPaceMinor)}/mo</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Estimated completion</dt><dd>{g.plan.remainingMinor === 0 ? "Reached" : g.etaDate ? formatDisplayDate(g.etaDate) : "Add contributions to estimate"}</dd></div>
            </dl>
            {g.plan.isOverdue ? <p className="mt-3 rounded-md bg-warning/10 p-2 text-xs text-warning">The target date has passed. Edit the goal to set a new deadline.</p> : null}
            <EstimateNote className="mt-3" />
          </CardContent>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>What if?</CardTitle><CardDescription>Monthly savings needed if you move the deadline</CardDescription></div></CardHeader>
          <CardContent>
            <Table>
              <THead><tr><TH>Deadline</TH><TH>Date</TH><TH className="text-right">Per month</TH><TH className="text-right">Difference</TH></tr></THead>
              <tbody>
                {scenarios.map((s) => (
                  <TR key={s.delta} className={s.delta === 0 ? "bg-accent-soft" : undefined}>
                    <TD>{s.delta === 0 ? "Current plan" : s.delta < 0 ? `${-s.delta} months earlier` : `Delay ${s.delta} months`}</TD>
                    <TD>{formatDisplayDate(s.targetDate)}</TD>
                    <TD className="text-right tabular">{s.possible ? m(s.monthlyRequiredMinor) : "Not possible"}</TD>
                    <TD className="text-right tabular text-muted">{s.possible && s.delta !== 0 ? `${s.monthlyRequiredMinor >= g.plan.monthlyRequiredMinor ? "+" : "−"}${m(Math.abs(s.monthlyRequiredMinor - g.plan.monthlyRequiredMinor))}` : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>History</CardTitle><CardDescription>{g.savings_account_id ? "Managed in the linked savings account" : "Allocations to this goal"}</CardDescription></div></CardHeader>
          <CardContent><ContributionHistory goalId={g.id} items={g.contributions} /></CardContent>
        </Card>
      </div>
    </>
  );
}
