"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionForm, FormRow, MoneyField, SelectField, SubmitButton, TextField, type FormAction } from "@/components/forms/action-form";
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
import { levelColor, type BudgetUsage } from "@/lib/finance/budgets";
import { deleteBudgetAction, saveBudgetAction } from "@/server/actions/budgets";
import type { Budget } from "@/types/database";

export function BudgetForm({ initial, onDone }: { initial?: Budget; onDone: () => void }) {
  const ws = useWorkspace();
  const [name, setName] = useState(initial?.name ?? "");
  return (
    <ActionForm action={saveBudgetAction as unknown as FormAction} onSuccess={onDone}>
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <FormRow>
        <SelectField
          label="Applies to"
          name="categoryId"
          defaultValue={initial?.expense_category_id ?? ""}
          onChange={(e) => {
            const c = ws.expenseCategories.find((x) => x.id === e.target.value);
            if (!initial && (!name || ws.expenseCategories.some((x) => x.name === name) || name === "Overall spending")) setName(c?.name ?? "Overall spending");
          }}
        >
          <option value="">Overall spending</option>
          {ws.expenseCategories.filter((c) => !c.parent_id && !c.archived).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
        <TextField label="Budget name" name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Food" />
      </FormRow>
      <FormRow>
        <SelectField label="Period" name="period" defaultValue={initial?.period ?? "monthly"}>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </SelectField>
        <MoneyField label="Budget amount" name="amount" currencySymbol={ws.currencySymbol} defaultValue={initial ? fromMinor(initial.amount_minor, ws.currency) : ""} required />
      </FormRow>
      <FormRow>
        <TextField label="Starts" name="startDate" type="date" defaultValue={initial?.start_date ?? `${ws.today.slice(0, 7)}-01`} />
        <TextField label="Ends (optional)" name="endDate" type="date" defaultValue={initial?.end_date ?? ""} />
      </FormRow>
      <TextField label="Warning thresholds (%)" name="thresholds" defaultValue={(initial?.thresholds ?? [50, 75, 90, 100]).join(",")} hint="Comma-separated, e.g. 50,75,90,100. You'll be notified as each is reached." />
      <div className="flex justify-end"><SubmitButton>{initial ? "Save budget" : "Create budget"}</SubmitButton></div>
    </ActionForm>
  );
}

export function NewBudgetButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}><Plus /> New budget</Button>
      {open ? <DialogContent title="Create budget"><BudgetForm onDone={() => setOpen(false)} /></DialogContent> : null}
    </Dialog>
  );
}

const LEVEL_LABEL = { ok: "On track", notice: "Heads up", warning: "Warning", critical: "Limit reached", exceeded: "Over budget" } as const;

export function BudgetCard({ budget, usage, periodLabel, categoryName }: { budget: Budget; usage: BudgetUsage; periodLabel: string; categoryName: string }) {
  const ws = useWorkspace();
  const { run } = useAction();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const m = (v: number) => formatMoney(v, ws.currency, { locale: ws.locale });
  const tone = levelColor(usage.level);
  const Icon = usage.level === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{budget.name}</p>
          <p className="text-xs text-muted">{categoryName} · {budget.period === "monthly" ? "Monthly" : "Yearly"} · {periodLabel}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Budget actions"><MoreVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => setDeleting(true)}><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-lg font-semibold tabular">{m(usage.spentMinor)}</span>
        <span className="text-xs text-muted tabular">of {m(usage.budgetMinor)}</span>
      </div>
      <Progress value={usage.utilizationPct} tone={tone} className="mt-2 h-2" label={`${budget.name}: ${usage.utilizationPct}% used`} />
      <div className="mt-2 flex items-center justify-between text-xs">
        <Badge variant={tone === "accent" ? "accent" : tone}><Icon className="size-3" /> {LEVEL_LABEL[usage.level]} · {usage.utilizationPct}%</Badge>
        <span className={usage.remainingMinor < 0 ? "text-danger tabular" : "text-muted tabular"}>{usage.remainingMinor < 0 ? `${m(-usage.remainingMinor)} over` : `${m(usage.remainingMinor)} left`}</span>
      </div>
      <p className="mt-2 text-[11px] text-muted">Alerts at {budget.thresholds.join("%, ")}%</p>
      <Dialog open={editing} onOpenChange={setEditing}>
        {editing ? <DialogContent title="Edit budget"><BudgetForm initial={budget} onDone={() => setEditing(false)} /></DialogContent> : null}
      </Dialog>
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete this budget?" description="Your transactions are not affected." onConfirm={async () => { await run(() => deleteBudgetAction(budget.id)); }} />
    </Card>
  );
}
