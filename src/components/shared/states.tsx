import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("glass flex flex-col items-center justify-center rounded-[22px] px-6 py-10 text-center", className)}>
      <div className="mb-3 rounded-2xl bg-accent-soft p-3">
        <Icon className="size-5 text-accent" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="glass flex flex-col items-center justify-center rounded-[22px] px-6 py-10 text-center">
      <AlertTriangle className="mb-3 size-6 text-danger" />
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EstimateNote({ children, className }: { children?: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] text-muted", className)}>{children ?? "Projections are estimates based on the values you entered, not guaranteed outcomes."}</p>;
}
