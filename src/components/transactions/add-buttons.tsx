"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionDialog } from "@/components/layout/quick-add";

export function AddTransactionButtons({ only }: { only?: "income" | "expense" }) {
  const [open, setOpen] = useState<null | "income" | "expense">(null);
  return (
    <>
      {only !== "income" ? <Button size="sm" onClick={() => setOpen("expense")}><Plus /> Expense</Button> : null}
      {only !== "expense" ? <Button size="sm" variant={only ? "default" : "secondary"} onClick={() => setOpen("income")}><Plus /> Income</Button> : null}
      <TransactionDialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} type={open ?? only ?? "expense"} />
    </>
  );
}
