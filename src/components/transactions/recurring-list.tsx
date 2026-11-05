"use client";

import { useState } from "react";
import { Pause, Pencil, Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ActionForm, CheckboxField, FormRow, MoneyField, SelectField, SubmitButton, TextField, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { useAction } from "@/components/forms/use-action";
import { EmptyState } from "@/components/shared/states";
import { formatMoney, fromMinor } from "@/lib/finance/money";
import { describeRule, nextOccurrence } from "@/lib/finance/recurrence";
import { addDaysISO, formatDisplayDate } from "@/lib/finance/dates";
import { FREQUENCIES } from "@/lib/labels";
import { deleteRecurringAction, updateRecurringAction } from "@/server/actions/transactions";
import type { RecurringTransaction } from "@/types/database";

export function RecurringList({ rules }: { rules: RecurringTransaction[] }) {
  const ws = useWorkspace();
  const { run } = useAction();
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [deleting, setDeleting] = useState<RecurringTransaction | null>(null);
  if (!rules.length) return <EmptyState title="No recurring transactions" description="When adding income or an expense, tick “This repeats” to schedule rent, salary, subscriptions and more." />;

  const toggle = (r: RecurringTransaction) => {
    const fd = new FormData();
    fd.set("id", r.id);
    fd.set("title", r.title);
    fd.set("amount", fromMinor(r.amount_minor, ws.currency));
    fd.set("frequency", r.frequency);
    fd.set("intervalCount", String(r.interval_count));
    fd.set("endDate", r.end_date ?? "");
    if (!r.is_active) fd.set("isActive", "on");
    return run(() => updateRecurringAction(null, fd));
  };

  return (
    <>
      <ul className="divide-y divide-border">
        {rules.map((r) => {
          const next = r.is_active ? nextOccurrence({ frequency: r.frequency, interval: r.interval_count, startDate: r.start_date, endDate: r.end_date }, addDaysISO(r.last_generated_date ?? r.start_date, r.last_generated_date ? 0 : -1)) : null;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {r.title}
                  <Badge variant={r.type === "income" ? "success" : "default"}>{r.type}</Badge>
                  {!r.is_active ? <Badge variant="warning">Paused</Badge> : null}
                </p>
                <p className="text-xs text-muted">
                  {describeRule({ frequency: r.frequency, interval: r.interval_count })} from {formatDisplayDate(r.start_date)}
                  {r.end_date ? ` until ${formatDisplayDate(r.end_date)}` : ""}
                  {next ? ` · next ${formatDisplayDate(next)}` : ""}
                </p>
              </div>
              <span className="text-sm font-semibold tabular">{formatMoney(r.amount_minor, ws.currency, { locale: ws.locale })}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => toggle(r)} aria-label={r.is_active ? "Pause" : "Resume"}>{r.is_active ? <Pause /> : <Play />}</Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(r)} aria-label="Edit"><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(r)} aria-label="Delete"><Trash2 /></Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title="Edit recurring transaction" description="Changes apply to future occurrences; past entries stay as recorded.">
            <ActionForm action={updateRecurringAction as unknown as FormAction} onSuccess={() => setEditing(null)}>
              <input type="hidden" name="id" value={editing.id} />
              <FormRow>
                <TextField label="Title" name="title" defaultValue={editing.title} required />
                <MoneyField label="Amount" name="amount" currencySymbol={ws.currencySymbol} defaultValue={fromMinor(editing.amount_minor, ws.currency)} />
              </FormRow>
              <FormRow className="sm:grid-cols-3">
                <SelectField label="Frequency" name="frequency" defaultValue={editing.frequency}>
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </SelectField>
                <TextField label="Every" name="intervalCount" type="number" min={1} max={365} defaultValue={editing.interval_count} />
                <TextField label="Ends on" name="endDate" type="date" defaultValue={editing.end_date ?? ""} />
              </FormRow>
              <CheckboxField name="isActive" label="Active" defaultChecked={editing.is_active} />
              <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
            </ActionForm>
          </DialogContent>
        ) : null}
      </Dialog>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Stop this recurring transaction?" description="No new occurrences will be created. Transactions already recorded are kept." confirmLabel="Stop schedule" onConfirm={async () => { if (deleting) await run(() => deleteRecurringAction(deleting.id)); }} />
    </>
  );
}
