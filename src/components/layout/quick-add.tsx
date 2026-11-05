"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, CreditCard, PiggyBank, Receipt, Target, TrendingUp, Wallet } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TransactionForm } from "@/components/transactions/transaction-form";

export function TransactionDialog({ open, onOpenChange, type }: { open: boolean; onOpenChange: (o: boolean) => void; type: "income" | "expense" }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={type === "income" ? "Add income" : "Add expense"} description="Amounts are stored precisely in your workspace currency.">
        <TransactionForm defaultType={type} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function QuickAdd({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState<null | "income" | "expense">(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent className="w-52">
          <DropdownMenuItem onSelect={() => setOpen("expense")}><Receipt /> Add expense</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("income")}><Wallet /> Add income</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/goals?new=1"><Target /> Create goal</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/savings?new=1"><PiggyBank /> Add savings</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/investments?new=1"><TrendingUp /> Add investment</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/debts?new=1"><CreditCard /> Add debt</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/reports"><BarChart3 /> View reports</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TransactionDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} type={open ?? "expense"} />
    </>
  );
}
