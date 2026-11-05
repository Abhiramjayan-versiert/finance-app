"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace";
import { listQueued, removeQueued } from "@/lib/offline/queue";
import { saveTransactionAction } from "@/server/actions/transactions";

/** Shows offline status and replays queued entries once back online. */
export function OfflineIndicator() {
  const ws = useWorkspace();
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      setPending((await listQueued(ws.userId)).length);
    } catch {
      setPending(0);
    }
  }, [ws.userId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    const items = await listQueued(ws.userId).catch(() => []);
    if (!items.length) return;
    setSyncing(true);
    let synced = 0;
    let failed = 0;
    for (const item of items) {
      const fd = new FormData();
      Object.entries(item.fields).forEach(([k, v]) => fd.set(k, v));
      fd.set("clientRef", item.clientRef);
      try {
        const r = await saveTransactionAction(null, fd);
        if (r.ok) {
          await removeQueued(item.clientRef);
          synced++;
        } else {
          failed++;
          if (/session has expired/i.test(r.error)) break; // keep for after sign-in
        }
      } catch {
        failed++;
        break;
      }
    }
    setSyncing(false);
    await refreshCount();
    if (synced) {
      toast.success(`Synced ${synced} offline ${synced === 1 ? "entry" : "entries"}`);
      router.refresh();
    }
    if (failed) toast.error(`${failed} offline ${failed === 1 ? "entry" : "entries"} could not be synced. They are kept on this device.`);
  }, [ws.userId, syncing, refreshCount, router]);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
    };
    // Defer the initial read so state isn't set synchronously inside the effect.
    const t = setTimeout(() => {
      update();
      void refreshCount();
    }, 0);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("fos-queue-changed", refreshCount);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("fos-queue-changed", refreshCount);
    };
  }, [sync, refreshCount]);

  if (online && !pending) return null;
  return (
    <button onClick={() => void sync()} className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning" aria-live="polite">
      {online ? <RefreshCw className={syncing ? "size-3 animate-spin" : "size-3"} /> : <CloudOff className="size-3" />}
      {online ? `${pending} to sync` : pending ? `Offline · ${pending} queued` : "Offline"}
    </button>
  );
}
