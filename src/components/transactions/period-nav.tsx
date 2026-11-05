"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PERIODS = [
  { v: "day", l: "Daily" },
  { v: "week", l: "Weekly" },
  { v: "month", l: "Monthly" },
  { v: "year", l: "Yearly" },
  { v: "custom", l: "Custom" },
];

export function PeriodNav({ period, label, prevDate, nextDate, from, to, showTabs = true }: { period: string; label: string; prevDate: string; nextDate: string; from: string; to: string; showTabs?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)));
    next.delete("day");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showTabs ? <Tabs value={period} onValueChange={(v) => go({ period: v })}>
        <TabsList>
          {PERIODS.map((p) => (
            <TabsTrigger key={p.v} value={p.v}>{p.l}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs> : null}
      {period === "custom" ? (
        <div className="flex items-center gap-2">
          <Input type="date" className="w-auto" aria-label="From" defaultValue={from} onChange={(e) => e.target.value && go({ from: e.target.value })} />
          <span className="text-muted">–</span>
          <Input type="date" className="w-auto" aria-label="To" defaultValue={to} onChange={(e) => e.target.value && go({ to: e.target.value })} />
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => go({ date: prevDate })} aria-label="Previous period"><ChevronLeft /></Button>
          <span className="min-w-36 text-center text-sm font-medium">{label}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => go({ date: nextDate })} aria-label="Next period"><ChevronRight /></Button>
        </div>
      )}
    </div>
  );
}
