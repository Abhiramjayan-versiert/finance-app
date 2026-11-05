"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { ActionForm, CheckboxField, FormRow, MoneyField, SelectField, SubmitButton, TextAreaField, TextField, type ClientActionResult, type FormAction } from "@/components/forms/action-form";
import { useWorkspace } from "@/components/providers/workspace";
import { Button } from "@/components/ui/button";
import { computeGoalPlan } from "@/lib/finance/goals";
import { formatMoney, fromMinor, toMinor } from "@/lib/finance/money";
import { addMonthsISO } from "@/lib/finance/dates";
import { GOAL_CATEGORIES, PRIORITIES } from "@/lib/labels";
import { saveGoalAction } from "@/server/actions/goals";
import { createClient } from "@/lib/supabase/client";
import type { FinancialGoal } from "@/types/database";

function safeMinor(v: string, currency: string) {
  try {
    return toMinor(v || "0", currency);
  } catch {
    return 0;
  }
}

export function GoalForm({ initial, savedMinor = 0, accounts, onDone }: { initial?: FinancialGoal; savedMinor?: number; accounts: Array<{ id: string; name: string; balanceMinor: number; linked: boolean }>; onDone?: () => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [target, setTarget] = useState(initial ? fromMinor(initial.target_amount_minor, ws.currency) : "");
  const [current, setCurrent] = useState("");
  const [date, setDate] = useState(initial?.target_date ?? addMonthsISO(ws.today, 12));
  const [account, setAccount] = useState(initial?.savings_account_id ?? "");
  const [imagePath, setImagePath] = useState<string | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);

  const linkedBalance = accounts.find((a) => a.id === account)?.balanceMinor ?? 0;
  const saved = account ? linkedBalance : initial ? savedMinor : safeMinor(current, ws.currency);
  const plan = computeGoalPlan({ targetMinor: safeMinor(target, ws.currency), savedMinor: saved, today: ws.today, targetDate: date || ws.today });
  const m = (v: number) => formatMoney(v, ws.currency, { locale: ws.locale });

  async function upload(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) return toast.error("Use a JPG, PNG or WEBP image up to 5 MB.");
    setUploading(true);
    try {
      const path = `${ws.userId}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
      const { error } = await createClient().storage.from("goal-images").upload(path, file, { contentType: file.type });
      if (error) throw error;
      setImagePath(path);
      toast.success("Image uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ActionForm
      action={saveGoalAction as unknown as FormAction}
      onSuccess={(r: ClientActionResult) => {
        onDone?.();
        const id = r.ok ? (r.data as { id?: string } | undefined)?.id : undefined;
        if (!initial && id) router.push(`/goals/${id}`);
        else router.refresh();
      }}
    >
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {imagePath !== undefined ? <input type="hidden" name="imagePath" value={imagePath ?? ""} /> : null}
      <FormRow>
        <TextField label="Goal name" name="name" defaultValue={initial?.name} required placeholder="e.g. MacBook Pro" />
        <SelectField label="Goal category" name="category" defaultValue={initial?.category ?? "gadgets"}>
          {GOAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </SelectField>
      </FormRow>
      <FormRow>
        <MoneyField label="Target amount" name="targetAmount" currencySymbol={ws.currencySymbol} value={target} onChange={(e) => setTarget(e.target.value)} required />
        <TextField label="Target date" name="targetDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </FormRow>
      <FormRow>
        <SelectField label="Fund from" name="savingsAccountId" value={account} onChange={(e) => setAccount(e.target.value)} hint={account ? "Progress follows this savings account's balance." : "Allocate money directly to this goal."}>
          <option value="">Direct goal allocations</option>
          {accounts.filter((a) => !a.linked || a.id === initial?.savings_account_id).map((a) => (
            <option key={a.id} value={a.id}>Savings: {a.name} ({m(a.balanceMinor)})</option>
          ))}
        </SelectField>
        <SelectField label="Priority" name="priority" defaultValue={initial?.priority ?? "medium"}>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </SelectField>
      </FormRow>
      {!initial && !account ? (
        <>
          <MoneyField label="Current savings for this goal" name="currentSavings" currencySymbol={ws.currencySymbol} value={current} onChange={(e) => setCurrent(e.target.value)} hint="Money you have already set aside." />
          <CheckboxField name="currentSavingsFromCash" label="Take this from my tracked cash balance" description="Leave unticked if the money was saved before you started using FINANCE OS." />
        </>
      ) : null}
      <FormRow>
        <TextField label="Product category" name="productCategory" defaultValue={initial?.product_category ?? ""} placeholder="e.g. Electronics" />
        <TextField label="Product URL" name="productUrl" type="url" defaultValue={initial?.product_url ?? ""} placeholder="https://… (optional)" />
      </FormRow>
      <TextAreaField label="Description" name="description" defaultValue={initial?.description ?? ""} rows={2} />
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" asChild disabled={uploading}>
          <label className="cursor-pointer"><ImagePlus /> {uploading ? "Uploading…" : imagePath ? "Image added" : "Product image"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
        </Button>
        <span className="text-[11px] text-muted">Optional</span>
      </div>
      {initial ? (
        <SelectField label="Status" name="status" defaultValue={initial.status}>
          <option value="not_started">Not started</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </SelectField>
      ) : null}

      <div className="rounded-lg border border-accent/30 bg-accent-soft p-3" aria-live="polite">
        <p className="mb-2 text-xs font-medium text-accent">Your plan</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          <div><dt className="text-muted">Remaining</dt><dd className="font-semibold tabular">{m(plan.remainingMinor)}</dd></div>
          <div><dt className="text-muted">Per month</dt><dd className="font-semibold tabular">{m(plan.monthlyRequiredMinor)}</dd></div>
          <div><dt className="text-muted">Per week</dt><dd className="font-semibold tabular">{m(plan.weeklyRequiredMinor)}</dd></div>
          <div><dt className="text-muted">Per day</dt><dd className="font-semibold tabular">{m(plan.dailyRequiredMinor)}</dd></div>
        </dl>
        <p className="mt-2 text-[11px] text-muted">{plan.isOverdue ? "The target date has passed — the full remaining amount is needed now." : `${plan.daysLeft} days · ${plan.weeksLeft} weeks · ${plan.monthsLeft} months left. Progress ${plan.progressPct}%.`}</p>
      </div>
      <div className="flex justify-end"><SubmitButton disabled={uploading}>{initial ? "Save & recalculate" : "Create goal"}</SubmitButton></div>
    </ActionForm>
  );
}
