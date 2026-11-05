"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import { ActionForm, CheckboxField, FormRow, MoneyField, SelectField, SubmitButton, TextAreaField, TextField, type ClientActionResult, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHODS, FREQUENCIES } from "@/lib/labels";
import { fromMinor } from "@/lib/finance/money";
import { saveTransactionAction } from "@/server/actions/transactions";
import { enqueue } from "@/lib/offline/queue";
import { uploadPrivateFile } from "@/lib/files/upload";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types/database";

const MAX_RECEIPT = 8 * 1024 * 1024; // photos are compressed before upload
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function TransactionForm({ initial, defaultType = "expense", onDone }: { initial?: Transaction; defaultType?: "income" | "expense"; onDone?: () => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [type, setType] = useState<"income" | "expense">(initial?.type ?? defaultType);
  const [recurring, setRecurring] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(initial?.receipt_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [clientRef, setClientRef] = useState(() => crypto.randomUUID());

  const expenseParents = ws.expenseCategories.filter((c) => !c.parent_id && !c.archived);
  const initialCat = initial?.expense_category_id ? ws.expenseCategories.find((c) => c.id === initial.expense_category_id) : undefined;
  const [parentId, setParentId] = useState<string>(initialCat?.parent_id ?? initialCat?.id ?? "");
  const subs = useMemo(() => ws.expenseCategories.filter((c) => c.parent_id === parentId && !c.archived), [ws.expenseCategories, parentId]);

  async function uploadReceipt(file: File) {
    if (!RECEIPT_TYPES.includes(file.type)) return toast.error("Receipts must be JPG, PNG, WEBP or PDF.");
    if (file.size > MAX_RECEIPT) return toast.error("That file is too large.");
    setUploading(true);
    try {
      const r = await uploadPrivateFile(file, "receipt");
      if (!r.ok) return void toast.error(r.error);
      setReceiptPath(r.path);
      toast.success("Receipt attached");
    } catch {
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  // Offline-aware submit: queue locally when there is no connection.
  const action: FormAction = async (prev, fd) => {
    if (typeof navigator !== "undefined" && !navigator.onLine && !initial && !fd.get("recurring")) {
      const fields: Record<string, string> = {};
      fd.forEach((v, k) => {
        if (typeof v === "string" && !k.startsWith("$ACTION")) fields[k] = v;
      });
      await enqueue({ clientRef, userId: ws.userId, fields, queuedAt: Date.now() });
      return { ok: true, message: "You're offline — saved on this device and will sync when you reconnect." };
    }
    return (saveTransactionAction as unknown as FormAction)(prev, fd);
  };

  const onSuccess = (r: ClientActionResult) => {
    if (r.ok) {
      setClientRef(crypto.randomUUID());
      router.refresh();
      onDone?.();
    }
  };

  return (
    <ActionForm action={action} onSuccess={onSuccess}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="clientRef" value={clientRef} />
      <input type="hidden" name="type" value={type} />
      {receiptPath ? <input type="hidden" name="receiptPath" value={receiptPath} /> : null}

      {!initial ? (
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1" role="radiogroup" aria-label="Transaction type">
          {(["expense", "income"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={cn("h-8 rounded-sm text-sm font-medium capitalize", type === t ? (t === "expense" ? "bg-card-2 text-foreground" : "bg-success/15 text-success") : "text-muted")}>
              {t}
            </button>
          ))}
        </div>
      ) : null}

      <FormRow>
        <TextField label={type === "income" ? "Income title" : "Expense name"} name="title" defaultValue={initial?.title} required maxLength={120} placeholder={type === "income" ? "e.g. November salary" : "e.g. Groceries at DMart"} />
        <MoneyField label="Amount" name="amount" currencySymbol={ws.currencySymbol} defaultValue={initial ? fromMinor(initial.amount_minor, ws.currency) : ""} required />
      </FormRow>

      {type === "expense" ? (
        <FormRow>
          <SelectField label="Category" name="categoryId" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Uncategorised</option>
            {expenseParents.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <SelectField label="Subcategory" name="subcategoryId" defaultValue={initialCat?.parent_id ? initialCat.id : ""} disabled={!subs.length} hint={!subs.length ? "Create subcategories in Settings" : undefined}>
            <option value="">None</option>
            {subs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
        </FormRow>
      ) : (
        <FormRow>
          <SelectField label="Income category" name="categoryId" defaultValue={initial?.income_category_id ?? ""}>
            <option value="">Uncategorised</option>
            {ws.incomeCategories.filter((c) => !c.archived).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <SelectField label="Status" name="status" defaultValue={initial?.status ?? "completed"} hint="Expected income is never counted as cash received.">
            <option value="completed">Received</option>
            <option value="expected">Expected (future)</option>
          </SelectField>
        </FormRow>
      )}

      <FormRow>
        <TextField label={recurring ? "Start date" : type === "income" ? "Date received" : "Date"} name="occurredOn" type="date" defaultValue={initial?.occurred_on ?? ws.today} required />
        <SelectField label="Payment method" name="paymentMethod" defaultValue={initial?.payment_method ?? ws.defaultPaymentMethod}>
          {PAYMENT_METHODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </SelectField>
      </FormRow>

      {type === "expense" ? <TextField label="Merchant" name="merchant" defaultValue={initial?.merchant ?? ""} maxLength={120} placeholder="Optional" /> : <TextField label="Source" name="source" defaultValue={initial?.source ?? ""} maxLength={120} placeholder="e.g. Acme Corp (optional)" />}
      <TextAreaField label={type === "expense" ? "Description" : "Notes"} name="notes" defaultValue={initial?.notes ?? ""} maxLength={1000} rows={2} />

      {!initial ? (
        <>
          <CheckboxField name="recurring" label="This repeats" description="Creates a schedule; each occurrence is recorded once, automatically." onChange={setRecurring} />
          {recurring ? (
            <FormRow className="sm:grid-cols-3">
              <SelectField label="Frequency" name="frequency" defaultValue="monthly">
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </SelectField>
              <TextField label="Every" name="intervalCount" type="number" min={1} max={365} defaultValue={1} hint="e.g. 2 = every 2nd period" />
              <TextField label="Ends on" name="endDate" type="date" hint="Optional" />
            </FormRow>
          ) : null}
        </>
      ) : null}

      {type === "expense" ? (
        <div className="flex items-center gap-2">
          {receiptPath ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
              <Paperclip className="size-3" /> Receipt attached
              <button type="button" onClick={() => setReceiptPath(null)} aria-label="Remove receipt"><X className="size-3" /></button>
            </span>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled={uploading} asChild>
              <label className="cursor-pointer">
                <Paperclip /> {uploading ? "Uploading…" : "Attach receipt"}
                <input type="file" accept={RECEIPT_TYPES.join(",")} className="sr-only" onChange={(e) => e.target.files?.[0] && uploadReceipt(e.target.files[0])} />
              </label>
            </Button>
          )}
          <span className="text-[11px] text-muted">Optional · photo or PDF (PDF up to 700 KB)</span>
        </div>
      ) : null}

      <div className="flex justify-end pt-1">
        <SubmitButton disabled={uploading}>{initial ? "Save changes" : type === "income" ? "Add income" : "Add expense"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
