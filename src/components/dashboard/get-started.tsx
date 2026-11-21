import Link from "next/link";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface StartStep {
  key: string;
  title: string;
  why: string;
  href: string;
  done: boolean;
}

/** A first-run checklist that walks a new user through every part of the app. */
export function GetStarted({ steps }: { steps: StartStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <Card className="mb-5 p-5 sm:p-6" aria-label="Get started">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles className="size-4 text-accent" /> Get started in a few minutes</p>
          <p className="mt-1 text-[13px] text-muted">Follow these steps in order — each one unlocks more of your dashboard. You can skip any of them.</p>
        </div>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent tabular">{done} of {steps.length} done</span>
      </div>
      <Progress className="mt-4" value={(done / steps.length) * 100} label="Setup progress" />
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? "hidden sm:block" : undefined}>
            <Link
              href={s.href}
              className={cn(
                "flex h-full items-start gap-3 rounded-2xl border p-3 transition-colors",
                s.done ? "border-transparent bg-card-2 opacity-70" : s === next ? "border-accent/40 bg-accent-soft hover:bg-accent-soft/80" : "border-border hover:bg-card-2",
              )}
            >
              <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", s.done ? "bg-success text-white" : "bg-card-2 text-muted ring-1 ring-border")}>
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", s.done && "line-through decoration-muted/60")}>{s.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{s.why}</span>
              </span>
              {!s.done ? <ChevronRight className="mt-1 size-4 shrink-0 text-muted" /> : null}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
