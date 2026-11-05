"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/providers/workspace";
import { PAYMENT_METHODS } from "@/lib/labels";

export function TransactionFilters({ showType = true, kind }: { showType?: boolean; kind?: "income" | "expense" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const ws = useWorkspace();
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const type = kind ?? sp.get("type") ?? "";
  const cats = type === "income" ? ws.incomeCategories : type === "expense" ? ws.expenseCategories : [...ws.expenseCategories, ...ws.incomeCategories];
  const active = ["q", "from", "to", "type", "category", "method"].some((k) => sp.get(k));
  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          placeholder="Search title, merchant, notes"
          defaultValue={sp.get("q") ?? ""}
          className="pl-9"
          aria-label="Search transactions"
          onKeyDown={(e) => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)}
          onBlur={(e) => e.target.value !== (sp.get("q") ?? "") && set("q", e.target.value)}
        />
      </div>
      <Input type="date" aria-label="From date" className="w-auto" defaultValue={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />
      <Input type="date" aria-label="To date" className="w-auto" defaultValue={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />
      {showType && !kind ? (
        <NativeSelect aria-label="Type" className="w-auto" value={sp.get("type") ?? ""} onChange={(e) => set("type", e.target.value)}>
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
        </NativeSelect>
      ) : null}
      <NativeSelect aria-label="Category" className="w-auto max-w-44" value={sp.get("category") ?? ""} onChange={(e) => set("category", e.target.value)}>
        <option value="">All categories</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}</option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Payment method" className="w-auto" value={sp.get("method") ?? ""} onChange={(e) => set("method", e.target.value)}>
        <option value="">All methods</option>
        {PAYMENT_METHODS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </NativeSelect>
      {active ? (
        <Button variant="ghost" size="sm" onClick={() => start(() => router.replace(pathname))}>
          <X /> Clear
        </Button>
      ) : null}
    </div>
  );
}
