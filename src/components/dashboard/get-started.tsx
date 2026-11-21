import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Expandable } from "@/components/shared/expandable";
import { cn } from "@/lib/utils";

export interface StartStep {
  key: string;
  title: string;
  why: string;
  href: string;
  done: boolean;
}

/** Compact first-run guide: progress, the one next step, and the full list on demand. */
export function GetStarted({ steps }: { steps: StartStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <Card className="p-5 sm:p-6" aria-label="Get started">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold">Getting started</p>
        <span className="text-sm font-medium text-muted tabular">{done} of {steps.length} done</span>
      </div>
      <Progress className="mt-3" value={(done / steps.length) * 100} label="Setup progress" />
      <Link href={next.href} className="press mt-4 flex min-h-16 items-center gap-3 rounded-xl bg-accent-soft px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-muted">Next step</span>
          <span className="block text-base font-semibold">{next.title}</span>
          <span className="block text-sm text-muted">{next.why}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-accent" aria-hidden />
      </Link>
      <Expandable title="See all steps" className="mt-3 border-0 bg-transparent [&>button]:px-0">
        <ol className="space-y-1">
          {steps.map((s, i) => (
            <li key={s.key}>
              <Link href={s.href} className="flex min-h-12 items-center gap-3 rounded-xl px-1 py-2 hover:bg-card-2">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold", s.done ? "bg-success text-white" : "bg-card-2 text-foreground")}>
                  {s.done ? <Check className="size-4" aria-label="Done" /> : i + 1}
                </span>
                <span className={cn("flex-1 text-base", s.done && "text-muted line-through")}>{s.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Expandable>
    </Card>
  );
}
