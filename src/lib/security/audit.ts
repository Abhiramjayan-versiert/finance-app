import "server-only";
import { getStore } from "@/lib/firebase/admin";
import { clientIp } from "./rate-limit";

/** Append-only audit trail for privileged actions. */
export async function audit(actor: { id: string | null; email: string | null }, action: string, target?: { type: string; id: string }, metadata: Record<string, unknown> = {}) {
  const s = getStore();
  await s.create(`audit_logs/${s.newId()}`, {
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    metadata,
    ip_address: await clientIp().catch(() => null),
    created_at: new Date().toISOString(),
  });
}
