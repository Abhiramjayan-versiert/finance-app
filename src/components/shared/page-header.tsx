import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";

/**
 * Page title with an optional plain-language "How this works" panel, so a
 * first-time user can understand any screen without leaving it.
 */
export function PageHeader({ title, description, actions, help }: { title: string; description?: string; actions?: ReactNode; help?: ReactNode }) {
  return (
    <div className="mb-5 sm:mb-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          {description ? <p className="mt-1 text-[15px] text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {help ? (
        <details className="group glass mt-4 rounded-2xl px-4 py-3 text-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground select-none">
            <HelpCircle className="size-4 text-accent" />
            How this page works
            <span className="ml-auto text-xs text-muted group-open:hidden">Show</span>
            <span className="ml-auto hidden text-xs text-muted group-open:inline">Hide</span>
          </summary>
          <div className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-muted [&_b]:font-medium [&_b]:text-foreground [&_li]:ml-4 [&_li]:list-disc">{help}</div>
        </details>
      ) : null}
    </div>
  );
}
