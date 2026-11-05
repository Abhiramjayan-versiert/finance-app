"use client";

import { useState } from "react";
import { Minus, Pause, Pencil, Play, Plus, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { ActionForm, CheckboxField, FormRow, MoneyField, SubmitButton, TextField, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { contributeToGoalAction, deleteContributionAction, deleteGoalAction, setGoalStatusAction } from "@/server/actions/goals";
import { formatMoney } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import type { FinancialGoal, GoalContribution } from "@/types/database";
import { GoalForm } from "./goal-form";

export function NewGoalButton({ accounts, defaultOpen }: { accounts: Array<{ id: string; name: string; balanceMinor: number; linked: boolean }>; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}><Plus /> New goal</Button>
      {open ? <DialogContent wide title="Plan a new goal" description="We'll calculate how much to save every day, week and month."><GoalForm accounts={accounts} onDone={() => setOpen(false)} /></DialogContent> : null}
    </Dialog>
  );
}

function ContributionForm({ goalId, direction, onDone }: { goalId: string; direction: "add" | "withdraw"; onDone: () => void }) {
  const ws = useWorkspace();
  const [clientRef] = useState(() => crypto.randomUUID());
  return (
    <ActionForm action={contributeToGoalAction as unknown as FormAction} onSuccess={onDone}>
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="clientRef" value={clientRef} />
      <FormRow>
        <MoneyField label="Amount" name="amount" currencySymbol={ws.currencySymbol} required autoFocus />
        <TextField label="Date" name="occurredOn" type="date" defaultValue={ws.today} />
      </FormRow>
      <TextField label="Note" name="note" placeholder="Optional" />
      <CheckboxField name="affectsCash" defaultChecked label={direction === "add" ? "Move from my tracked cash balance" : "Return to my tracked cash balance"} description="Untick for money held outside FINANCE OS's cash tracking. Either way it is never counted as income or expense." />
      <div className="flex justify-end"><SubmitButton>{direction === "add" ? "Add to goal" : "Release from goal"}</SubmitButton></div>
    </ActionForm>
  );
}

export function GoalActions({ goal, savedMinor, accounts }: { goal: FinancialGoal; savedMinor: number; accounts: Array<{ id: string; name: string; balanceMinor: number; linked: boolean }> }) {
  const [dlg, setDlg] = useState<null | "add" | "withdraw" | "edit">(null);
  const [del, setDel] = useState(false);
  const { run } = useAction();
  const router = useRouter();
  const linked = !!goal.savings_account_id;
  return (
    <div className="flex flex-wrap gap-2">
      {!linked ? (
        <>
          <Button size="sm" onClick={() => setDlg("add")}><Plus /> Add money</Button>
          <Button size="sm" variant="secondary" onClick={() => setDlg("withdraw")} disabled={savedMinor <= 0}><Minus /> Withdraw</Button>
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => router.push("/savings")}>Add via savings account</Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => setDlg("edit")}><Pencil /> Edit</Button>
      {goal.status === "paused" ? (
        <Button size="sm" variant="ghost" onClick={() => run(() => setGoalStatusAction(goal.id, "active"))}><Play /> Resume</Button>
      ) : goal.status !== "cancelled" && goal.status !== "completed" ? (
        <Button size="sm" variant="ghost" onClick={() => run(() => setGoalStatusAction(goal.id, "paused"))}><Pause /> Pause</Button>
      ) : null}
      {goal.status !== "cancelled" && goal.status !== "completed" ? <Button size="sm" variant="ghost" onClick={() => run(() => setGoalStatusAction(goal.id, "cancelled"))}><XCircle /> Cancel goal</Button> : null}
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDel(true)}><Trash2 /> Delete</Button>
      <Dialog open={dlg !== null} onOpenChange={(o) => !o && setDlg(null)}>
        {dlg === "edit" ? (
          <DialogContent wide title="Edit goal" description="Change the target or deadline and everything is recalculated."><GoalForm initial={goal} savedMinor={savedMinor} accounts={accounts} onDone={() => setDlg(null)} /></DialogContent>
        ) : dlg ? (
          <DialogContent title={dlg === "add" ? `Add to ${goal.name}` : `Withdraw from ${goal.name}`}><ContributionForm goalId={goal.id} direction={dlg} onDone={() => setDlg(null)} /></DialogContent>
        ) : null}
      </Dialog>
      <ConfirmDialog open={del} onOpenChange={setDel} title="Delete this goal?" description="The goal and its allocation history are deleted. Amounts that were moved from your cash balance return to it." onConfirm={async () => { const okd = await run(() => deleteGoalAction(goal.id)); if (okd) router.push("/goals"); }} />
    </div>
  );
}

export function ContributionHistory({ goalId, items }: { goalId: string; items: GoalContribution[] }) {
  const ws = useWorkspace();
  const { run } = useAction();
  if (!items.length) return <p className="py-4 text-center text-xs text-muted">No contributions yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="flex-1">
            {formatDisplayDate(c.occurred_on)}
            <span className="block text-xs text-muted">{c.note ?? (c.amount_minor > 0 ? "Contribution" : "Withdrawal")}{c.affects_cash ? " · from cash" : " · external"}</span>
          </span>
          <span className={c.amount_minor > 0 ? "font-medium text-success tabular" : "font-medium tabular"}>{c.amount_minor > 0 ? "+" : "−"}{formatMoney(Math.abs(c.amount_minor), ws.currency, { locale: ws.locale })}</span>
          <ConfirmDialog trigger={<Button variant="ghost" size="icon-sm" aria-label="Remove entry"><Trash2 /></Button>} title="Remove this entry?" description="Goal progress is recalculated." confirmLabel="Remove" onConfirm={async () => { await run(() => deleteContributionAction(c.id, goalId)); }} />
        </li>
      ))}
    </ul>
  );
}
