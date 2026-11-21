"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

export function SheetContent({ className, children, title, side = "left", ...props }: React.ComponentProps<typeof D.Content> & { title: string; side?: "left" | "bottom" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <D.Content
        className={cn(
          "surface-raised fixed z-50 flex flex-col outline-none",
          side === "left" ? "inset-y-0 left-0 w-80 rounded-r-[28px] data-[state=open]:animate-in data-[state=open]:slide-in-from-left" : "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[28px] data-[state=open]:enter",
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <D.Title className="text-lg font-semibold">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          <D.Close className="flex size-10 items-center justify-center rounded-full bg-card-2 text-foreground hover:bg-border" aria-label="Close">
            <X className="size-5" />
          </D.Close>
        </div>
        <div className="flex-1 overflow-y-auto safe-bottom">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
