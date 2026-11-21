import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  change,
  changeGood = "up",
  highlight,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  change?: number | null;
  changeGood?: "up" | "down";
  highlight?: boolean;
  className?: string;
}) {
  const good = change == null ? null : changeGood === "up" ? change >= 0 : change <= 0;
  return (
    <Card className={cn("p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-muted">{label}</p>
        {Icon ? <Icon className={cn("size-4 shrink-0", highlight ? "text-accent" : "text-muted")} aria-hidden /> : null}
      </div>
      <p className={cn("mt-1.5 truncate text-xl font-semibold tabular sm:text-2xl", highlight && "text-accent")} title={value}>
        {value}
      </p>
      <div className="mt-1 flex items-start gap-1.5 text-sm leading-snug">
        {change != null ? (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-danger")}>
            {change >= 0 ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownRight className="size-4" aria-hidden />}
            <span className="sr-only">{change >= 0 ? "up" : "down"}</span>
            {Math.abs(change)}%
          </span>
        ) : null}
        {hint ? <span className="line-clamp-2 text-muted">{hint}</span> : null}
      </div>
    </Card>
  );
}
