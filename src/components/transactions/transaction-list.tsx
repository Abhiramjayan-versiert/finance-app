"use client";

import { useState } from "react";
import { MoreVertical, Paperclip, Pencil, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/components/providers/workspace";
import { useAction } from "@/components/forms/use-action";
import { formatMoney } from "@/lib/finance/money";
import { formatDisplayDate } from "@/lib/finance/dates";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { deleteTransactionAction, getReceiptUrlAction, restoreTransactionAction } from "@/server/actions/transactions";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types/database";
import { TransactionForm } from "./transaction-form";
import { EmptyState } from "@/components/shared/states";

export function TransactionList({ transactions, emptyTitle = "No transactions yet", emptyDescription, compact }: { transactions: Transaction[]; emptyTitle?: string; emptyDescription?: string; compact?: boolean }) {
  const ws = useWorkspace();
  const { run } = useAction();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const cats = new Map([...ws.expenseCategories, ...ws.incomeCategories].map((c) => [c.id, c]));

  if (!transactions.length) return <EmptyState title={emptyTitle} description={emptyDescription ?? "Use the Add button to record your first entry."} />;

  const openReceipt = async (path: string) => {
    const r = await getReceiptUrlAction(path);
    if (r.ok && r.data) window.open(r.data.url, "_blank", "noopener,noreferrer");
    else toast.error(r.ok ? "Could not open receipt" : r.error);
  };

  return (
    <>
      <ul className="divide-y divide-border">
        {transactions.map((t) => {
          const cat = cats.get(t.expense_category_id ?? t.income_category_id ?? "");
          const parent = cat?.parent_id ? cats.get(cat.parent_id) : undefined;
          return (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: `${cat?.color ?? "#A0A6AD"}22`, color: cat?.color ?? "#A0A6AD" }} aria-hidden>
                {(cat?.name ?? t.title).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <span className="truncate">{t.title}</span>
                  {t.is_recurring ? <Repeat className="size-3 shrink-0 text-muted" aria-label="Recurring" /> : null}
                  {t.status === "expected" ? <Badge variant="warning">Expected</Badge> : null}
                </p>
                <p className="truncate text-xs text-muted">
                  {parent ? `${parent.name} › ` : ""}
                  {cat?.name ?? "Uncategorised"} · {formatDisplayDate(t.occurred_on)}
                  {!compact ? ` · ${PAYMENT_METHOD_LABEL[t.payment_method]}` : ""}
                  {!compact && (t.merchant || t.source) ? ` · ${t.merchant ?? t.source}` : ""}
                </p>
              </div>
              <span className={cn("shrink-0 text-sm font-semibold tabular", t.type === "income" ? "text-success" : "text-foreground", t.status === "expected" && "opacity-60")}>
                {t.type === "income" ? "+" : "−"}
                {formatMoney(t.amount_minor, ws.currency, { locale: ws.locale })}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.title}`}>
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setEditing(t)}><Pencil /> Edit</DropdownMenuItem>
                  {t.receipt_path ? <DropdownMenuItem onSelect={() => openReceipt(t.receipt_path!)}><Paperclip /> View receipt</DropdownMenuItem> : null}
                  <DropdownMenuItem destructive onSelect={() => setDeleting(t)}><Trash2 /> Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title={`Edit ${editing.type}`}>
            <TransactionForm initial={editing} onDone={() => setEditing(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this transaction?"
        description={deleting ? `"${deleting.title}" will be removed from all totals and reports.${deleting.is_recurring ? " The recurring schedule continues — stop it from Transactions › Recurring." : ""}` : ""}
        onConfirm={async () => {
          if (!deleting) return;
          const id = deleting.id;
          const okd = await run(() => deleteTransactionAction(id));
          if (okd) toast("Transaction deleted", { action: { label: "Undo", onClick: () => void run(() => restoreTransactionAction(id)) } });
        }}
      />
    </>
  );
}
