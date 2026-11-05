"use client";

import { useRef, useState } from "react";
import { ArrowLeftRight, Minus, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionForm, CheckboxField, FormRow, MoneyField, SelectField, SubmitButton, TextField, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatMoney, fromMinor } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import { SAVINGS_KINDS, SAVINGS_KIND_LABEL } from "@/lib/labels";
import { deleteSavingsAccountAction, deleteSavingsTransactionAction, saveSavingsAccountAction, savingsMovementAction, savingsTransferAction } from "@/server/actions/savings";
import type { SavingsTransaction } from "@/types/database";

export interface AccountLite {
  id: string;
  name: string;
  kind: string;
  balanceMinor: number;
  target_amount_minor: number | null;
  monthly_target_minor: number | null;
  color: string;
  depositedThisMonthMinor: number;
  linkedGoalName?: string | null;
}

function AccountForm({ initial, onDone }: { initial?: AccountLite; onDone: () => void }) {
  const ws = useWorkspace();
  return (
    <ActionForm action={saveSavingsAccountAction as unknown as FormAction} onSuccess={onDone}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <FormRow>
        <TextField label="Name" name="name" defaultValue={initial?.name} required placeholder="e.g. Emergency fund" />
        <SelectField label="Type" name="kind" defaultValue={initial?.kind ?? "general"}>
          {SAVINGS_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </SelectField>
      </FormRow>
      <FormRow>
        <MoneyField label="Savings target" name="targetAmount" currencySymbol={ws.currencySymbol} defaultValue={initial?.target_amount_minor ? fromMinor(initial.target_amount_minor, ws.currency) : ""} hint="Optional" />
        <MoneyField label="Monthly savings target" name="monthlyTarget" currencySymbol={ws.currencySymbol} defaultValue={initial?.monthly_target_minor ? fromMinor(initial.monthly_target_minor, ws.currency) : ""} hint="Portion of monthly income to set aside" />
      </FormRow>
      {!initial ? <MoneyField label="Existing balance" name="openingBalance" currencySymbol={ws.currencySymbol} hint="Money already saved before using FINANCE OS (not taken from tracked cash)." /> : null}
      <input type="hidden" name="color" value={initial?.color ?? "#B7F34A"} />
      <div className="flex justify-end"><SubmitButton>{initial ? "Save" : "Create account"}</SubmitButton></div>
    </ActionForm>
  );
}

function MovementForm({ accountId, type, onDone }: { accountId: string; type: "deposit" | "withdrawal"; onDone: () => void }) {
  const ws = useWorkspace();
  const ref = useRef(crypto.randomUUID());
  return (
    <ActionForm action={savingsMovementAction as unknown as FormAction} onSuccess={onDone}>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="clientRef" value={ref.current} />
      <FormRow>
        <MoneyField label="Amount" name="amount" currencySymbol={ws.currencySymbol} required autoFocus />
        <TextField label="Date" name="occurredOn" type="date" defaultValue={ws.today} />
      </FormRow>
      <TextField label="Note" name="note" placeholder="Optional" />
      <CheckboxField name="affectsCash" defaultChecked label={type === "deposit" ? "Move from my tracked cash balance" : "Return to my tracked cash balance"} description="Savings movements are never counted as income or expenses." />
      <div className="flex justify-end"><SubmitButton>{type === "deposit" ? "Add savings" : "Withdraw"}</SubmitButton></div>
    </ActionForm>
  );
}

export function TransferForm({ accounts, onDone }: { accounts: AccountLite[]; onDone: () => void }) {
  const ws = useWorkspace();
  return (
    <ActionForm action={savingsTransferAction as unknown as FormAction} onSuccess={onDone}>
      <FormRow>
        <SelectField label="From" name="fromAccountId" defaultValue={accounts[0]?.id}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatMoney(a.balanceMinor, ws.currency, { locale: ws.locale })})</option>)}
        </SelectField>
        <SelectField label="To" name="toAccountId" defaultValue={accounts[1]?.id}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </SelectField>
      </FormRow>
      <FormRow>
        <MoneyField label="Amount" name="amount" currencySymbol={ws.currencySymbol} required />
        <TextField label="Date" name="occurredOn" type="date" defaultValue={ws.today} />
      </FormRow>
      <TextField label="Note" name="note" placeholder="Optional" />
      <p className="text-xs text-muted">Transfers move money between buckets only — your cash balance, income and expenses are unchanged.</p>
      <div className="flex justify-end"><SubmitButton>Transfer</SubmitButton></div>
    </ActionForm>
  );
}

export function SavingsToolbar({ accounts, defaultOpen }: { accounts: AccountLite[]; defaultOpen?: boolean }) {
  const [dlg, setDlg] = useState<null | "new" | "transfer">(defaultOpen ? "new" : null);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setDlg("transfer")} disabled={accounts.length < 2}><ArrowLeftRight /> Transfer</Button>
      <Button size="sm" onClick={() => setDlg("new")}><Plus /> New savings account</Button>
      <Dialog open={dlg !== null} onOpenChange={(o) => !o && setDlg(null)}>
        {dlg === "new" ? <DialogContent title="New savings account" description="A virtual bucket for money you are setting aside."><AccountForm onDone={() => setDlg(null)} /></DialogContent> : null}
        {dlg === "transfer" ? <DialogContent title="Transfer between savings accounts"><TransferForm accounts={accounts} onDone={() => setDlg(null)} /></DialogContent> : null}
      </Dialog>
    </>
  );
}

export function SavingsAccountCard({ account }: { account: AccountLite }) {
  const ws = useWorkspace();
  const { run } = useAction();
  const [dlg, setDlg] = useState<null | "deposit" | "withdrawal" | "edit">(null);
  const [del, setDel] = useState(false);
  const m = (v: number) => formatMoney(v, ws.currency, { locale: ws.locale });
  const pct = account.target_amount_minor ? (account.balanceMinor / account.target_amount_minor) * 100 : null;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{account.name}</p>
          <p className="text-xs text-muted">{SAVINGS_KIND_LABEL[account.kind] ?? account.kind}{account.linkedGoalName ? ` · funds goal “${account.linkedGoalName}”` : ""}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Account actions"><MoreVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setDlg("edit")}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => setDel(true)}><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular">{m(account.balanceMinor)}</p>
      {pct !== null ? (
        <>
          <Progress value={pct} tone="success" className="mt-2 h-2" />
          <p className="mt-1 text-xs text-muted tabular">{Math.min(100, Math.round(pct * 10) / 10)}% of {m(account.target_amount_minor!)}</p>
        </>
      ) : null}
      {account.monthly_target_minor ? (
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted">This month</span>
          <Badge variant={account.depositedThisMonthMinor >= account.monthly_target_minor ? "success" : "default"}>{m(account.depositedThisMonthMinor)} / {m(account.monthly_target_minor)}</Badge>
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => setDlg("deposit")}><Plus /> Add</Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setDlg("withdrawal")} disabled={account.balanceMinor <= 0}><Minus /> Withdraw</Button>
      </div>
      <Dialog open={dlg !== null} onOpenChange={(o) => !o && setDlg(null)}>
        {dlg === "edit" ? <DialogContent title="Edit savings account"><AccountForm initial={account} onDone={() => setDlg(null)} /></DialogContent> : null}
        {dlg === "deposit" || dlg === "withdrawal" ? <DialogContent title={`${dlg === "deposit" ? "Add to" : "Withdraw from"} ${account.name}`}><MovementForm accountId={account.id} type={dlg} onDone={() => setDlg(null)} /></DialogContent> : null}
      </Dialog>
      <ConfirmDialog open={del} onOpenChange={setDel} title="Delete this savings account?" description="Only empty accounts can be deleted. Its history is removed." onConfirm={async () => { await run(() => deleteSavingsAccountAction(account.id)); }} />
    </Card>
  );
}

const TYPE_LABEL = { deposit: "Deposit", withdrawal: "Withdrawal", transfer_in: "Transfer in", transfer_out: "Transfer out" } as const;

export function SavingsHistory({ items, names }: { items: SavingsTransaction[]; names: Record<string, string> }) {
  const ws = useWorkspace();
  const { run } = useAction();
  if (!items.length) return <p className="py-6 text-center text-xs text-muted">No savings activity yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((t) => {
        const plus = t.type === "deposit" || t.type === "transfer_in";
        return (
          <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{names[t.account_id] ?? "Account"} · {TYPE_LABEL[t.type]}</span>
              <span className="block text-xs text-muted">{formatDisplayDate(t.occurred_on)}{t.note ? ` · ${t.note}` : ""}{t.type === "deposit" || t.type === "withdrawal" ? (t.affects_cash ? " · cash" : " · external") : ""}</span>
            </span>
            <span className={plus ? "font-medium text-success tabular" : "font-medium tabular"}>{plus ? "+" : "−"}{formatMoney(t.amount_minor, ws.currency, { locale: ws.locale })}</span>
            <ConfirmDialog trigger={<Button variant="ghost" size="icon-sm" aria-label="Remove entry"><Trash2 /></Button>} title="Remove this entry?" description={t.transfer_group ? "Both sides of this transfer will be removed." : "The account balance is recalculated."} confirmLabel="Remove" onConfirm={async () => { await run(() => deleteSavingsTransactionAction(t.id)); }} />
          </li>
        );
      })}
    </ul>
  );
}
