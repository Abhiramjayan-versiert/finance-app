"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, CreditCard, PiggyBank, Receipt, Target, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { TransactionDialog } from "@/components/layout/quick-add";
import { cn } from "@/lib/utils";

const cls = "group flex min-w-[132px] flex-1 items-center gap-3 rounded-2xl px-3 py-3 text-left press hover:bg-card-2";

function Inner({ icon: Icon, label, hint, primary }: { icon: LucideIcon; label: string; hint: string; primary?: boolean }) {
  return (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", primary ? "bg-accent text-accent-foreground" : "bg-card-2 text-foreground")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[13px] font-medium text-foreground">{label}</span>
        <span className="block truncate text-[11px] text-muted">{hint}</span>
      </span>
    </>
  );
}

export function QuickActions() {
  const [open, setOpen] = useState<null | "income" | "expense">(null);
  return (
    <>
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-4 2xl:grid-cols-7" role="toolbar" aria-label="Quick actions">
        <button className={cls} onClick={() => setOpen("expense")} aria-label="Add expense"><Inner primary icon={Receipt} label="Add expense" hint="Something you paid for" /></button>
        <button className={cls} onClick={() => setOpen("income")} aria-label="Add income"><Inner primary icon={Wallet} label="Add income" hint="Salary, freelance, gifts" /></button>
        <Link className={cls} href="/goals?new=1"><Inner icon={Target} label="Create goal" hint="Save for something" /></Link>
        <Link className={cls} href="/savings?new=1"><Inner icon={PiggyBank} label="Add savings" hint="A savings pot" /></Link>
        <Link className={cls} href="/investments?new=1"><Inner icon={TrendingUp} label="Investment" hint="Funds, stocks, gold" /></Link>
        <Link className={cls} href="/debts?new=1"><Inner icon={CreditCard} label="Add debt" hint="Loan, card or EMI" /></Link>
        <Link className={cls} href="/reports"><Inner icon={BarChart3} label="Reports" hint="Charts & downloads" /></Link>
      </div>
      <TransactionDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} type={open ?? "expense"} />
    </>
  );
}
