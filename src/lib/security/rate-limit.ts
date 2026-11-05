import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { isServiceRoleConfigured } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

const memory = new Map<string, { hits: number; start: number }>();

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

function hashKey(parts: string[]) {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40);
}

/**
 * Fixed-window rate limiter. Uses the database (shared across serverless
 * instances) when the service role is configured; otherwise falls back to a
 * per-instance memory window. Keys are hashed so no raw emails/IPs are stored.
 */
export async function rateLimit(scope: string, identifiers: string[], max: number, windowSeconds: number): Promise<boolean> {
  const key = `${scope}:${hashKey(identifiers)}`;
  if (isServiceRoleConfigured()) {
    try {
      const { data, error } = await createAdminClient().rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
      if (!error) return data === true;
    } catch {
      // fall through to memory limiter
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now - entry.start > windowSeconds * 1000) {
    memory.set(key, { hits: 1, start: now });
    return true;
  }
  if (entry.hits >= max) return false;
  entry.hits++;
  return true;
}
