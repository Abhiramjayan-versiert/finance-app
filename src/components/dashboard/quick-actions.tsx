"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftRight, Receipt, Target, Wallet, type LucideIcon } from "lucide-react";
import { TransactionDialog } from "@/components/layout/quick-add";

function Tile({ icon: Icon, label, primary }: { icon: LucideIcon; label: string; primary?: boolean }) {
  return (
    <>
      <span className={primary ? "flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground" : "flex size-12 items-center justify-center rounded-full bg-card-2 text-foreground"}>
        <Icon className="size-[22px]" aria-hidden />
      </span>
      <span className="text-sm font-medium leading-tight text-foreground">{label}</span>
    </>
  );
}

const cls = "press flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl px-1 py-2 text-center outline-none hover:bg-card-2 focus-visible:ring-2 focus-visible:ring-ring";

/** The four things people do most. Everything else lives behind the + button. */
export function QuickActions() {
  const [open, setOpen] = useState<null | "income" | "expense">(null);
  return (
    <>
      <div className="grid grid-cols-4 gap-1" role="toolbar" aria-label="Quick actions">
        <button className={cls} onClick={() => setOpen("expense")} aria-label="Add expense"><Tile primary icon={Receipt} label="Add expense" /></button>
        <button className={cls} onClick={() => setOpen("income")} aria-label="Add income"><Tile icon={Wallet} label="Add income" /></button>
        <Link className={cls} href="/savings" aria-label="Move money to savings"><Tile icon={ArrowLeftRight} label="Save money" /></Link>
        <Link className={cls} href="/goals?new=1" aria-label="Add a goal"><Tile icon={Target} label="Add goal" /></Link>
      </div>
      <TransactionDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} type={open ?? "expense"} />
    </>
  );
}
