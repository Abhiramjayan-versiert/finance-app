"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClientActionResult } from "./action-form";

/** Run a server action imperatively (e.g. delete buttons) with toasts. */
export function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ClientActionResult>, opts: { onSuccess?: () => void } = {}) =>
    new Promise<boolean>((resolve) => {
      start(async () => {
        try {
          const r = await fn();
          if (r.ok) {
            if (r.message) toast.success(r.message);
            opts.onSuccess?.();
            router.refresh();
            resolve(true);
          } else {
            toast.error(r.error);
            resolve(false);
          }
        } catch {
          toast.error("Network error. Please check your connection and try again.");
          resolve(false);
        }
      });
    });
  return { pending, run };
}
