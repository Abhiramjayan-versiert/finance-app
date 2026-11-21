"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Progressive disclosure. The content is not mounted until the user opens it,
 * so charts and long lists cost nothing on first load.
 */
export function Expandable({ title, description, children, defaultOpen = false, className }: { title: string; description?: string; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{title}</span>
          {description ? <span className="block text-sm text-muted">{description}</span> : null}
        </span>
        <span className="flex items-center gap-1 text-sm font-medium text-accent">
          {open ? "Hide" : "Show"}
          <ChevronDown className={cn("size-5 transition-transform duration-150", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open ? <div className="border-t border-border p-4 sm:p-5">{children}</div> : null}
    </section>
  );
}
