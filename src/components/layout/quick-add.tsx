"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, CreditCard, PiggyBank, Receipt, Target, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TransactionForm } from "@/components/transactions/transaction-form";

export function TransactionDialog({ open, onOpenChange, type }: { open: boolean; onOpenChange: (o: boolean) => void; type: "income" | "expense" }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={type === "income" ? "Add income" : "Add expense"}
        description={type === "income" ? "Record money you received. Only the name and amount are required." : "Record money you spent. Only the name and amount are required."}
      >
        <TransactionForm defaultType={type} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint: string }) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-2xl bg-card-2"><Icon /></span>
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </>
  );
}

export function QuickAdd({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState<null | "income" | "expense">(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel>What would you like to add?</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setOpen("expense")}><Row icon={Receipt} label="Add expense" hint="Something you paid for" /></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("income")}><Row icon={Wallet} label="Add income" hint="Salary or any money received" /></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/goals?new=1"><Row icon={Target} label="Create goal" hint="Plan a purchase or target" /></Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/savings?new=1"><Row icon={PiggyBank} label="Add savings" hint="Emergency fund or savings pot" /></Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/investments?new=1"><Row icon={TrendingUp} label="Add investment" hint="Mutual funds, stocks, gold…" /></Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/debts?new=1"><Row icon={CreditCard} label="Add debt" hint="Loan, credit card or EMI" /></Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/reports"><Row icon={BarChart3} label="View reports" hint="Charts, PDF & Excel exports" /></Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TransactionDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} type={open ?? "expense"} />
    </>
  );
}
