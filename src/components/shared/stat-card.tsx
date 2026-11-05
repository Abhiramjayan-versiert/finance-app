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
    <Card className={cn("p-4", highlight && "border-accent/40", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        {Icon ? <Icon className={cn("size-4 shrink-0", highlight ? "text-accent" : "text-muted")} /> : null}
      </div>
      <p className={cn("mt-2 truncate text-lg font-semibold tabular sm:text-xl", highlight && "text-accent")} title={value}>
        {value}
      </p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {change != null ? (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-danger")}>
            {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(change)}%
          </span>
        ) : null}
        {hint ? <span className="truncate text-muted">{hint}</span> : null}
      </div>
    </Card>
  );
}
