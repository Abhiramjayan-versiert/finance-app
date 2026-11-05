import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "./rate-limit";

/** Append-only audit trail for privileged actions (written with the service role). */
export async function audit(actor: { id: string; email: string }, action: string, target?: { type: string; id: string }, metadata: Record<string, unknown> = {}) {
  const ip = await clientIp();
  const { error } = await createAdminClient().from("audit_logs").insert({
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    metadata,
    ip_address: ip,
  });
  if (error) throw new Error(`Audit log failed: ${error.message}`);
}
