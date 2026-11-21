"use client";

import * as React from "react";
import { AlertDialog as A } from "radix-ui";
import { Button } from "./button";

/** Confirmation dialog used before destructive actions. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  onConfirm,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <A.Trigger asChild>{trigger}</A.Trigger> : null}
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <A.Content className="glass-strong fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[28px] p-6 data-[state=open]:lg-pop">
          <A.Title className="text-base font-semibold">{title}</A.Title>
          <A.Description className="mt-2 text-sm text-muted">{description}</A.Description>
          <div className="mt-5 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </A.Cancel>
            <Button
              variant={destructive ? "danger" : "default"}
              disabled={pending}
              onClick={async (e) => {
                e.preventDefault();
                setPending(true);
                try {
                  await onConfirm();
                  onOpenChange?.(false);
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
