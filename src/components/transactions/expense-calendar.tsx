"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { useWorkspace } from "@/components/providers/workspace";
import { formatMoney } from "@/lib/finance/money";
import { cn } from "@/lib/utils";

/** Month grid of daily spending. Darker cells = more spending (single-hue magnitude). */
export function ExpenseCalendar({ month, byDay, selected }: { month: string; byDay: Record<string, number>; selected?: string }) {
  const ws = useWorkspace();
  const sp = useSearchParams();
  const pathname = usePathname();
  const first = new Date(`${month}-01T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const max = Math.max(1, ...Object.values(byDay));
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const href = (d: string) => {
    const p = new URLSearchParams(sp.toString());
    if (selected === d) p.delete("day");
    else p.set("day", d);
    return `${pathname}?${p.toString()}`;
  };
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted" aria-hidden>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Spending calendar">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const v = byDay[d] ?? 0;
          const intensity = v ? 0.15 + 0.65 * (v / max) : 0;
          const future = d > ws.today;
          return (
            <Link
              key={d}
              href={href(d)}
              scroll={false}
              role="gridcell"
              aria-selected={selected === d}
              aria-label={`${d}: ${formatMoney(v, ws.currency, { locale: ws.locale })}`}
              title={`${d}: ${formatMoney(v, ws.currency, { locale: ws.locale })}`}
              className={cn("relative flex aspect-square flex-col items-center justify-center rounded-md border text-[11px] transition-colors", selected === d ? "border-accent" : "border-transparent hover:border-border-strong", d === ws.today && "font-bold", future && "opacity-40")}
              style={{ background: v ? `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, transparent)` : "var(--card-2)" }}
            >
              <span className={cn(intensity > 0.55 && "text-accent-foreground")}>{Number(d.slice(8))}</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">Tap a date to see its expenses. Darker = more spent.</p>
    </div>
  );
}
