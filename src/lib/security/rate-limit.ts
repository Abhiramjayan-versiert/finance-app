import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { isBackendConfigured } from "@/lib/env";
import { getStore } from "@/lib/firebase/admin";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Fixed-window rate limiter stored in Firestore (shared across serverless
 * instances, updated in a transaction). Keys are hashed — no raw emails/IPs stored.
 */
export async function rateLimit(scope: string, identifiers: string[], max: number, windowSeconds: number): Promise<boolean> {
  const key = `${scope}_${createHash("sha256").update(identifiers.join("|")).digest("hex").slice(0, 32)}`;
  if (!isBackendConfigured()) return true;
  try {
    return await getStore().transaction(async (tx) => {
      const path = `rate_limits/${key}`;
      const now = Date.now();
      const rec = await tx.get<{ hits: number; window_start: number }>(path);
      if (!rec || rec.window_start < now - windowSeconds * 1000) {
        tx.set(path, { hits: 1, window_start: now, expires_at: new Date(now + windowSeconds * 1000).toISOString() });
        return true;
      }
      if (rec.hits >= max) return false;
      tx.update(path, { hits: rec.hits + 1 });
      return true;
    });
  } catch {
    return true; // fail open on infrastructure errors; auth provider limits still apply
  }
}
