"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, CreditCard, PiggyBank, Receipt, Target, TrendingUp, Wallet } from "lucide-react";
import { TransactionDialog } from "@/components/layout/quick-add";

export function QuickActions() {
  const [open, setOpen] = useState<null | "income" | "expense">(null);
  const cls = "flex min-w-[88px] flex-1 flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-3 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground";
  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0" role="toolbar" aria-label="Quick actions">
        <button className={cls} onClick={() => setOpen("expense")}><Receipt className="size-4 text-accent" /> Add expense</button>
        <button className={cls} onClick={() => setOpen("income")}><Wallet className="size-4 text-accent" /> Add income</button>
        <Link className={cls} href="/goals?new=1"><Target className="size-4" /> Create goal</Link>
        <Link className={cls} href="/savings?new=1"><PiggyBank className="size-4" /> Add savings</Link>
        <Link className={cls} href="/investments?new=1"><TrendingUp className="size-4" /> Investment</Link>
        <Link className={cls} href="/debts?new=1"><CreditCard className="size-4" /> Add debt</Link>
        <Link className={cls} href="/reports"><BarChart3 className="size-4" /> Reports</Link>
      </div>
      <TransactionDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} type={open ?? "expense"} />
    </>
  );
}
