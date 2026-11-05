"use client";

import { useMemo, useRef, useState } from "react";
import { MoreVertical, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { ActionForm, CheckboxField, FormRow, MoneyField, SelectField, SubmitButton, TextAreaField, TextField, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { EstimateNote } from "@/components/shared/states";
import { formatMoney, fromMinor, toMinor } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import { amortize, calculateEmi, compareRepayment, repaymentProgress, splitPayment } from "@/lib/finance/debt";
import { DEBT_KINDS, DEBT_KIND_LABEL, PAYMENT_FREQUENCIES } from "@/lib/labels";
import { deleteDebtAction, deleteDebtPaymentAction, recordDebtPaymentAction, saveDebtAction } from "@/server/actions/debts";
import type { Debt, DebtPayment } from "@/types/database";

export interface DebtLite extends Debt {
  outstandingMinor: number;
  principalPaidMinor: number;
  interestPaidMinor: number;
  payments: DebtPayment[];
  nextDue: string | null;
}

function DebtForm({ initial, onDone }: { initial?: DebtLite; onDone: () => void }) {
  const ws = useWorkspace();
  return (
    <ActionForm action={saveDebtAction as unknown as FormAction} onSuccess={onDone}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <FormRow>
        <TextField label="Loan name" name="name" defaultValue={initial?.name} required placeholder="e.g. Car loan" />
        <SelectField label="Type" name="kind" defaultValue={initial?.kind ?? "personal"}>
          {DEBT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </SelectField>
      </FormRow>
      <FormRow>
        <MoneyField label="Principal amount" name="principal" currencySymbol={ws.currencySymbol} defaultValue={initial ? fromMinor(initial.principal_minor, ws.currency) : ""} required />
        <MoneyField label="Outstanding amount" name="outstanding" currencySymbol={ws.currencySymbol} defaultValue={initial ? fromMinor(initial.outstandingMinor, ws.currency) : ""} required hint="What you owe today" />
      </FormRow>
      <FormRow className="sm:grid-cols-3">
        <TextField label="Interest rate (% p.a.)" name="interestRate" inputMode="decimal" defaultValue={initial?.interest_rate ?? ""} required />
        <MoneyField label="EMI" name="emi" currencySymbol={ws.currencySymbol} defaultValue={initial?.emi_minor ? fromMinor(initial.emi_minor, ws.currency) : ""} />
        <SelectField label="Payment frequency" name="paymentFrequency" defaultValue={initial?.payment_frequency ?? "monthly"}>
          {PAYMENT_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </SelectField>
      </FormRow>
      <FormRow className="sm:grid-cols-3">
        <TextField label="Loan start date" name="startDate" type="date" defaultValue={initial?.start_date ?? ws.today} required />
        <TextField label="Loan end date" name="endDate" type="date" defaultValue={initial?.end_date ?? ""} />
        <TextField label="Next EMI due" name="nextDueDate" type="date" defaultValue={initial?.next_due_date ?? ""} hint="For reminders" />
      </FormRow>
      <TextField label="Lender" name="lender" defaultValue={initial?.lender ?? ""} placeholder="Optional" />
      <TextAreaField label="Notes" name="notes" defaultValue={initial?.notes ?? ""} rows={2} />
      <div className="flex justify-end"><SubmitButton>{initial ? "Save" : "Add debt"}</SubmitButton></div>
    </ActionForm>
  );
}

export function NewDebtButton({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}><Plus /> Add debt</Button>
      {open ? <DialogContent wide title="Add a loan or debt"><DebtForm onDone={() => setOpen(false)} /></DialogContent> : null}
    </Dialog>
  );
}

function PaymentForm({ debt, onDone }: { debt: DebtLite; onDone: () => void }) {
  const ws = useWorkspace();
  const ref = useRef(crypto.randomUUID());
  const [amount, setAmount] = useState(debt.emi_minor ? fromMinor(Math.min(debt.emi_minor, debt.outstandingMinor + Math.round((debt.outstandingMinor * debt.interest_rate) / 1200)), ws.currency) : "");
  const [auto, setAuto] = useState(true);
  let preview: ReturnType<typeof splitPayment> | null = null;
  try {
    preview = splitPayment(toMinor(amount || "0", ws.currency), debt.outstandingMinor, debt.interest_rate, debt.payment_frequency);
  } catch {}
  const m = (v: number) => formatMoney(v, ws.currency, { locale: ws.locale });
  return (
    <ActionForm action={recordDebtPaymentAction as unknown as FormAction} onSuccess={onDone}>
      <input type="hidden" name="debtId" value={debt.id} />
      <input type="hidden" name="clientRef" value={ref.current} />
      <FormRow>
        <MoneyField label="Payment amount" name="amount" currencySymbol={ws.currencySymbol} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <TextField label="Paid on" name="paidOn" type="date" defaultValue={ws.today} />
      </FormRow>
      <CheckboxField name="autoSplit" defaultChecked label="Split interest automatically" description={`Interest = outstanding × ${debt.interest_rate}% ÷ periods per year.`} onChange={setAuto} />
      {!auto ? <MoneyField label="Interest portion" name="interest" currencySymbol={ws.currencySymbol} /> : preview ? <p className="text-xs text-muted">Interest {m(preview.interestMinor)} · principal {m(preview.principalMinor)}</p> : null}
      <TextField label="Note" name="note" placeholder="Optional" />
      <CheckboxField name="affectsCash" defaultChecked label="Paid from my tracked cash balance" />
      <div className="flex justify-end"><SubmitButton>Record payment</SubmitButton></div>
    </ActionForm>
  );
}

export function DebtCard({ debt }: { debt: DebtLite }) {
  const ws = useWorkspace();
  const { run } = useAction();
  const [dlg, setDlg] = useState<null | "pay" | "edit" | "plan">(null);
  const [del, setDel] = useState(false);
  const m = (v: number) => formatMoney(v, ws.currency, { locale: ws.locale });
  const progress = repaymentProgress(debt.opening_outstanding_minor, debt.outstandingMinor);
  const payment = debt.emi_minor ?? 0;
  const projection = payment > 0 && debt.outstandingMinor > 0 ? amortize({ balanceMinor: debt.outstandingMinor, annualRatePct: debt.interest_rate, paymentMinor: payment, frequency: debt.payment_frequency, startDate: debt.nextDue ?? ws.today }) : null;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{debt.name}</p>
          <p className="text-xs text-muted">{DEBT_KIND_LABEL[debt.kind]}{debt.lender ? ` · ${debt.lender}` : ""} · {debt.interest_rate}% p.a.</p>
        </div>
        <div className="flex items-center gap-1">
          {debt.outstandingMinor === 0 ? <Badge variant="success">Repaid</Badge> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Debt actions"><MoreVertical /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setDlg("edit")}><Pencil /> Edit</DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => setDel(true)}><Trash2 /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular">{m(debt.outstandingMinor)}</span>
        <span className="text-xs text-muted">outstanding</span>
      </div>
      <Progress value={progress} tone="success" className="mt-2 h-2" label="Repayment progress" />
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-muted">Repaid</dt><dd className="font-medium tabular">{progress}% · {m(debt.principalPaidMinor)}</dd></div>
        <div><dt className="text-muted">Interest paid</dt><dd className="font-medium tabular">{m(debt.interestPaidMinor)}</dd></div>
        <div><dt className="text-muted">EMI</dt><dd className="font-medium tabular">{debt.emi_minor ? m(debt.emi_minor) : "—"}</dd></div>
        <div><dt className="text-muted">Next due</dt><dd className="font-medium">{debt.nextDue && debt.outstandingMinor > 0 ? formatDisplayDate(debt.nextDue) : "—"}</dd></div>
        <div className="col-span-2"><dt className="text-muted">Estimated debt-free</dt><dd className="font-medium">{debt.outstandingMinor === 0 ? "Done" : projection?.neverPaysOff ? "EMI doesn't cover interest" : projection?.payoffDate ? `${formatDisplayDate(projection.payoffDate, "MMM yyyy")} · ${m(projection.totalInterestMinor)} more interest` : "Add an EMI to project"}</dd></div>
      </dl>
      <div className="mt-4 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => setDlg("pay")} disabled={debt.outstandingMinor === 0}><Wallet /> Record payment</Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setDlg("plan")}>Repayment plan</Button>
      </div>
      <Dialog open={dlg !== null} onOpenChange={(o) => !o && setDlg(null)}>
        {dlg === "pay" ? <DialogContent title={`Payment · ${debt.name}`}><PaymentForm debt={debt} onDone={() => setDlg(null)} /></DialogContent> : null}
        {dlg === "edit" ? <DialogContent wide title="Edit debt"><DebtForm initial={debt} onDone={() => setDlg(null)} /></DialogContent> : null}
        {dlg === "plan" ? <DialogContent wide title={`Repayment plan · ${debt.name}`}><RepaymentPlan debt={debt} /></DialogContent> : null}
      </Dialog>
      <ConfirmDialog open={del} onOpenChange={setDel} title={`Delete ${debt.name}?`} description="The debt and its payment history are removed." onConfirm={async () => { await run(() => deleteDebtAction(debt.id)); }} />
    </Card>
  );
}

function RepaymentPlan({ debt }: { debt: DebtLite }) {
  const ws = useWorkspace();
  const { run } = useAction();
  const m = (v: number) => formatMoney(v, ws.currency, { locale: ws.locale });
  const suggested = debt.emi_minor ?? calculateEmi(debt.outstandingMinor, debt.interest_rate, 12, debt.payment_frequency);
  const [payment, setPayment] = useState(fromMinor(suggested, ws.currency));
  const [extra, setExtra] = useState("0");
  const result = useMemo(() => {
    try {
      return compareRepayment({ balanceMinor: debt.outstandingMinor, annualRatePct: debt.interest_rate, paymentMinor: toMinor(payment || "0", ws.currency), extraPaymentMinor: toMinor(extra || "0", ws.currency), frequency: debt.payment_frequency, startDate: debt.nextDue ?? ws.today });
    } catch {
      return null;
    }
  }, [payment, extra, debt, ws]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="pp">Regular payment</Label><Input id="pp" inputMode="decimal" value={payment} onChange={(e) => setPayment(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="pe">Extra payment each period</Label><Input id="pe" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
      </div>
      {result ? (
        result.base.neverPaysOff ? (
          <p className="rounded-md bg-danger/10 p-3 text-sm text-danger">This payment doesn&apos;t cover the interest — the balance would never reduce.</p>
        ) : (
          <>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-md bg-card-2 p-3"><p className="text-xs text-muted">Current plan</p><p className="font-semibold">{result.base.periods} payments · ends {result.base.payoffDate ? formatDisplayDate(result.base.payoffDate, "MMM yyyy") : "—"}</p><p className="text-xs text-muted">Total interest {m(result.base.totalInterestMinor)}</p></div>
              <div className="rounded-md bg-accent-soft p-3"><p className="text-xs text-muted">With extra payment</p><p className="font-semibold">{result.faster.periods} payments · ends {result.faster.payoffDate ? formatDisplayDate(result.faster.payoffDate, "MMM yyyy") : "—"}</p><p className="text-xs text-accent">Saves {m(result.interestSavedMinor)} interest · {result.periodsSaved} fewer payments</p></div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background-2 text-muted"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Date</th><th className="p-2 text-right">Payment</th><th className="p-2 text-right">Interest</th><th className="p-2 text-right">Principal</th><th className="p-2 text-right">Balance</th></tr></thead>
                <tbody>
                  {result.faster.schedule.slice(0, 600).map((r) => (
                    <tr key={r.period} className="border-t border-border"><td className="p-2">{r.period}</td><td className="p-2">{r.date ? formatDisplayDate(r.date, "MMM yy") : ""}</td><td className="p-2 text-right tabular">{m(r.paymentMinor)}</td><td className="p-2 text-right tabular">{m(r.interestMinor)}</td><td className="p-2 text-right tabular">{m(r.principalMinor)}</td><td className="p-2 text-right tabular">{m(r.balanceMinor)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : <p className="text-xs text-danger">Enter valid amounts.</p>}
      <EstimateNote>Repayment projections are estimates assuming a fixed rate and on-time payments. Your lender&apos;s schedule may differ.</EstimateNote>
      {debt.payments.length ? (
        <div>
          <p className="mb-2 text-sm font-medium">Payment history</p>
          <ul className="divide-y divide-border">
            {debt.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{formatDisplayDate(p.paid_on)}<span className="block text-xs text-muted">Principal {m(p.principal_minor)} · interest {m(p.interest_minor)}</span></span>
                <span className="tabular">{m(p.amount_minor)}</span>
                <ConfirmDialog trigger={<Button variant="ghost" size="icon-sm" aria-label="Remove payment"><Trash2 /></Button>} title="Remove this payment?" description="The outstanding balance is recalculated." confirmLabel="Remove" onConfirm={async () => { await run(() => deleteDebtPaymentAction(p.id)); }} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
