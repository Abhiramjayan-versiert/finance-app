import { cn } from "@/lib/utils";

const TONES = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger", muted: "bg-muted" } as const;

export function Progress({ value, tone = "accent", className, label }: { value: number; tone?: keyof typeof TONES; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-card-2", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", TONES[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}
