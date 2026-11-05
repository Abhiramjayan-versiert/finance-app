"use client";

import { useState } from "react";
import { Camera, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionForm, FormRow, MoneyField, SelectField, SubmitButton, TextAreaField, TextField, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { formatMoney, fromMinor } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import { MANUAL_ASSET_TYPES, MANUAL_LIABILITY_TYPES } from "@/lib/labels";
import { deleteBalanceItemAction, saveAssetAction, saveLiabilityAction, saveSnapshotAction } from "@/server/actions/networth";
import type { ManualAsset, ManualLiability } from "@/types/database";

type Item = { kind: "asset"; row?: ManualAsset } | { kind: "liability"; row?: ManualLiability };

function ItemForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const ws = useWorkspace();
  const isAsset = item.kind === "asset";
  const row = item.row;
  const amount = row ? ("value_minor" in row ? row.value_minor : row.amount_minor) : null;
  return (
    <ActionForm action={(isAsset ? saveAssetAction : saveLiabilityAction) as unknown as FormAction} onSuccess={onDone}>
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <FormRow>
        <TextField label="Name" name="name" defaultValue={row?.name} required placeholder={isAsset ? "e.g. Apartment" : "e.g. HDFC credit card"} />
        <SelectField label="Type" name="type" defaultValue={row?.type ?? (isAsset ? "property" : "credit_card")}>
          {(isAsset ? MANUAL_ASSET_TYPES : MANUAL_LIABILITY_TYPES).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </SelectField>
      </FormRow>
      <FormRow>
        <MoneyField label={isAsset ? "Current value" : "Amount owed"} name={isAsset ? "value" : "amount"} currencySymbol={ws.currencySymbol} defaultValue={amount != null ? fromMinor(amount, ws.currency) : ""} required />
        <TextField label="As of" name="asOf" type="date" defaultValue={row?.as_of ?? ws.today} />
      </FormRow>
      <TextAreaField label="Notes" name="notes" defaultValue={row?.notes ?? ""} rows={2} />
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  );
}

export function NetWorthToolbar() {
  const [item, setItem] = useState<Item | null>(null);
  const { run, pending } = useAction();
  return (
    <>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => saveSnapshotAction())}><Camera /> Save snapshot</Button>
      <Button size="sm" variant="secondary" onClick={() => setItem({ kind: "liability" })}><Plus /> Liability</Button>
      <Button size="sm" onClick={() => setItem({ kind: "asset" })}><Plus /> Asset</Button>
      <Dialog open={!!item} onOpenChange={(o) => !o && setItem(null)}>
        {item ? <DialogContent title={item.kind === "asset" ? "Add asset" : "Add liability"} description="Only items not tracked elsewhere — savings, investments and loans are included automatically."><ItemForm item={item} onDone={() => setItem(null)} /></DialogContent> : null}
      </Dialog>
    </>
  );
}

export function ManualItems({ assets, liabilities, cashSource }: { assets: ManualAsset[]; liabilities: ManualLiability[]; cashSource: "tracked" | "manual" }) {
  const ws = useWorkspace();
  const { run } = useAction();
  const [item, setItem] = useState<Item | null>(null);
  const m = (v: number) => formatMoney(v, ws.currency, { locale: ws.locale });
  const rows = [...assets.map((a) => ({ kind: "asset" as const, row: a, amount: a.value_minor })), ...liabilities.map((l) => ({ kind: "liability" as const, row: l, amount: l.amount_minor }))];
  if (!rows.length) return <p className="py-6 text-center text-xs text-muted">No manual assets or liabilities. Add property, vehicles, gold, bank balances or card balances.</p>;
  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const excluded = r.kind === "asset" && cashSource === "tracked" && (r.row.type === "cash" || r.row.type === "bank_account");
          return (
            <li key={r.row.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.row.name}</span>
                <span className="block text-xs text-muted">
                  {r.kind === "asset" ? "Asset" : "Liability"} · updated {formatDisplayDate(r.row.as_of)}
                  {excluded ? " · excluded (cash is tracked automatically — change in Settings)" : ""}
                </span>
              </span>
              <span className={r.kind === "asset" ? (excluded ? "text-muted line-through tabular" : "tabular") : "text-danger tabular"}>{r.kind === "liability" ? "−" : ""}{m(r.amount)}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setItem(r.kind === "asset" ? { kind: "asset", row: r.row as ManualAsset } : { kind: "liability", row: r.row as ManualLiability })}><Pencil /></Button>
              <ConfirmDialog trigger={<Button variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 /></Button>} title={`Remove ${r.row.name}?`} description="Your net worth is recalculated." confirmLabel="Remove" onConfirm={async () => { await run(() => deleteBalanceItemAction(r.kind, r.row.id)); }} />
            </li>
          );
        })}
      </ul>
      <Dialog open={!!item} onOpenChange={(o) => !o && setItem(null)}>
        {item ? <DialogContent title="Update value"><ItemForm item={item} onDone={() => setItem(null)} /></DialogContent> : null}
      </Dialog>
    </>
  );
}
