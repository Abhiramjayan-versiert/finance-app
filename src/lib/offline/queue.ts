"use client";

/**
 * Device-local queue for transactions captured while offline. Only the
 * user's own unsent entries are stored (scoped by user id) and the queue is
 * cleared on sign-out. Entries are replayed through the authenticated server
 * action, which re-validates everything and de-duplicates by client_ref.
 */

const DB = "finance-os-offline";
const STORE = "queue";

export interface QueuedTx {
  clientRef: string;
  userId: string;
  fields: Record<string, string>;
  queuedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "clientRef" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(item: QueuedTx) {
  await tx("readwrite", (s) => s.put(item));
  window.dispatchEvent(new Event("fos-queue-changed"));
}

export async function listQueued(userId: string): Promise<QueuedTx[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await tx<QueuedTx[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedTx[]>);
  return all.filter((q) => q.userId === userId);
}

export async function removeQueued(clientRef: string) {
  await tx("readwrite", (s) => s.delete(clientRef));
  window.dispatchEvent(new Event("fos-queue-changed"));
}

export async function clearOfflineQueue() {
  if (typeof indexedDB === "undefined") return;
  await tx("readwrite", (s) => s.clear());
}
