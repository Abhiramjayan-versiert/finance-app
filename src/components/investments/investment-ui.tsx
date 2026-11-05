"use client";

import { useRef, useState } from "react";
import { History, MoreVertical, Pencil, Plus, RefreshCw, ShoppingCart, Trash2, HandCoins } from "lucide-react";
import { ActionForm, CheckboxField, FormRow, MoneyField, SelectField, SubmitButton, TextAreaField, TextField, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { formatMoney, fromMinor } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import { ASSET_CLASSES } from "@/lib/labels";
import { addInvestmentTxAction, createInvestmentAction, deleteInvestmentAction, deleteInvestmentTxAction, updateInvestmentAction } from "@/server/actions/investments";
import type { InvestmentTransaction, Investment } from "@/types/database";

function InvestmentForm({ onDone }: { onDone: () => void }) {
  const ws = useWorkspace();
  const [type, setType] = useState("mutual_fund");
  const sip = type === "sip";
  return (
    <ActionForm action={createInvestmentAction as unknown as FormAction} onSuccess={onDone}>
      <FormRow>
        <TextField label="Investment name" name="name" required placeholder="e.g. Nifty 50 index fund" />
        <SelectField label="Asset type" name="assetType" value={type} onChange={(e) => setType(e.target.value)}>
          {ASSET_CLASSES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </SelectField>
      </FormRow>
      <FormRow>
        <MoneyField label={sip ? "Total contributed so far" : "Amount invested"} name="amountInvested" currencySymbol={ws.currencySymbol} required />
        <TextField label="Purchase date" name="purchaseDate" type="date" defaultValue={ws.today} required />
      </FormRow>
      <FormRow className="sm:grid-cols-3">
        <TextField label="Units / quantity" name="units" inputMode="decimal" placeholder="Optional" />
        <MoneyField label="Purchase price / unit" name="purchasePrice" currencySymbol={ws.currencySymbol} hint="Optional" />
        <MoneyField label="Current estimated value" name="currentValue" currencySymbol={ws.currencySymbol} hint="Defaults to amount invested" />
      </FormRow>
      {sip ? (
        <FormRow className="sm:grid-cols-4">
          <MoneyField label="Monthly SIP" name="sipMonthly" currencySymbol={ws.currencySymbol} />
          <TextField label="SIP start" name="sipStartDate" type="date" />
          <TextField label="Duration (months)" name="sipDurationMonths" type="number" min={1} max={600} />
          <TextField label="Expected return %" name="expectedReturnPct" inputMode="decimal" placeholder="e.g. 12" />
        </FormRow>
      ) : (
        <TextField label="Expected annual return % (for projections)" name="expectedReturnPct" inputMode="decimal" placeholder="Optional" />
      )}
      <TextField label="Symbol / folio" name="symbol" placeholder="Optional" />
      <TextAreaField label="Notes" name="notes" rows={2} />
      <CheckboxField name="fromCash" label="Paid from my tracked cash balance" description="Leave unticked for investments made before you started tracking." />
      <p className="text-[11px] text-muted">FINANCE OS does not fetch live prices. Update the current value whenever you check your holdings.</p>
      <div className="flex justify-end"><SubmitButton>Add investment</SubmitButton></div>
    </ActionForm>
  );
}

export function NewInvestmentButton({ defaultOpen }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}><Plus /> Add investment</Button>
      {open ? <DialogContent wide title="Add investment" description="Manual entry — no brokerage connection required."><InvestmentForm onDone={() => setOpen(false)} /></DialogContent> : null}
    </Dialog>
  );
}

function TxForm({ investmentId, type, onDone, currentValueMinor }: { investmentId: string; type: "buy" | "sell" | "valuation"; onDone: () => void; currentValueMinor: number }) {
  const ws = useWorkspace();
  const ref = useRef(crypto.randomUUID());
  return (
    <ActionForm action={addInvestmentTxAction as unknown as FormAction} onSuccess={onDone}>
      <input type="hidden" name="investmentId" value={investmentId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="clientRef" value={ref.current} />
      <FormRow>
        <MoneyField label={type === "valuation" ? "Current total value" : type === "buy" ? "Amount invested" : "Amount received"} name="amount" currencySymbol={ws.currencySymbol} defaultValue={type === "valuation" ? fromMinor(currentValueMinor, ws.currency) : ""} required autoFocus />
        <TextField label="Date" name="occurredOn" type="date" defaultValue={ws.today} />
      </FormRow>
      {type !== "valuation" ? <TextField label="Units" name="units" inputMode="decimal" placeholder="Optional" /> : null}
      <TextField label="Note" name="note" placeholder="Optional" />
      {type !== "valuation" ? <CheckboxField name="affectsCash" defaultChecked={type === "buy"} label={type === "buy" ? "Paid from tracked cash" : "Proceeds go to tracked cash"} /> : null}
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  );
}

function EditForm({ inv, onDone }: { inv: Investment; onDone: () => void }) {
  const ws = useWorkspace();
  return (
    <ActionForm action={updateInvestmentAction as unknown as FormAction} onSuccess={onDone}>
      <input type="hidden" name="id" value={inv.id} />
      <FormRow>
        <TextField label="Name" name="name" defaultValue={inv.name} required />
        <TextField label="Symbol / folio" name="symbol" defaultValue={inv.symbol ?? ""} />
      </FormRow>
      <FormRow className="sm:grid-cols-4">
        <MoneyField label="Monthly SIP" name="sipMonthly" currencySymbol={ws.currencySymbol} defaultValue={inv.sip_monthly_minor ? fromMinor(inv.sip_monthly_minor, ws.currency) : ""} />
        <TextField label="SIP start" name="sipStartDate" type="date" defaultValue={inv.sip_start_date ?? ""} />
        <TextField label="Duration (months)" name="sipDurationMonths" type="number" defaultValue={inv.sip_duration_months ?? ""} />
        <TextField label="Expected return %" name="expectedReturnPct" defaultValue={inv.expected_return_pct ?? ""} />
      </FormRow>
      <TextAreaField label="Notes" name="notes" defaultValue={inv.notes ?? ""} rows={2} />
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  );
}

const TX_LABEL = { buy: "Buy", sell: "Sell", valuation: "Value update" } as const;

export function InvestmentRowActions({ inv, txs }: { inv: Investment; txs: InvestmentTransaction[] }) {
  const ws = useWorkspace();
  const { run } = useAction();
  const [dlg, setDlg] = useState<null | "buy" | "sell" | "valuation" | "edit" | "history">(null);
  const [del, setDel] = useState(false);
  const titles = { buy: "Record purchase", sell: "Record sale", valuation: "Update current value", edit: "Edit investment", history: "Transaction history" };
  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button variant="secondary" size="sm" onClick={() => setDlg("valuation")}><RefreshCw /> <span className="hidden sm:inline">Update value</span></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${inv.name}`}><MoreVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setDlg("buy")}><ShoppingCart /> Buy more</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDlg("sell")}><HandCoins /> Sell / redeem</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDlg("history")}><History /> History</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDlg("edit")}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => setDel(true)}><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={dlg !== null} onOpenChange={(o) => !o && setDlg(null)}>
        {dlg ? (
          <DialogContent title={`${titles[dlg]} · ${inv.name}`}>
            {dlg === "edit" ? (
              <EditForm inv={inv} onDone={() => setDlg(null)} />
            ) : dlg === "history" ? (
              <ul className="divide-y divide-border">
                {[...txs].reverse().map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex-1">{TX_LABEL[t.type]}<span className="block text-xs text-muted">{formatDisplayDate(t.occurred_on)}{t.units ? ` · ${t.units} units` : ""}{t.note ? ` · ${t.note}` : ""}</span></span>
                    <span className="tabular">{formatMoney(t.amount_minor, ws.currency, { locale: ws.locale })}</span>
                    <ConfirmDialog trigger={<Button variant="ghost" size="icon-sm" aria-label="Remove"><Trash2 /></Button>} title="Remove this entry?" description="The holding is recalculated from the remaining history." confirmLabel="Remove" onConfirm={async () => { await run(() => deleteInvestmentTxAction(t.id)); }} />
                  </li>
                ))}
              </ul>
            ) : (
              <TxForm investmentId={inv.id} type={dlg} currentValueMinor={inv.current_value_minor} onDone={() => setDlg(null)} />
            )}
          </DialogContent>
        ) : null}
      </Dialog>
      <ConfirmDialog open={del} onOpenChange={setDel} title={`Delete ${inv.name}?`} description="The investment and its history are removed from your portfolio and net worth." onConfirm={async () => { await run(() => deleteInvestmentAction(inv.id)); }} />
    </>
  );
}
