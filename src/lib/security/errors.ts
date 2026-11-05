import "server-only";
import { isServiceRoleConfigured } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Records an error for the admin System Health view without leaking details to users. */
export async function logServerError(error: unknown, path?: string, userId?: string | null, source: "server" | "client" | "cron" | "auth" = "server") {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 2000);
  console.error(`[finance-os] ${path ?? "unknown"}:`, error);
  if (!isServiceRoleConfigured()) return;
  try {
    await createAdminClient().from("app_errors").insert({ message, path: path?.slice(0, 300) ?? null, user_id: userId ?? null, source });
  } catch {
    // never throw from the error logger
  }
}
