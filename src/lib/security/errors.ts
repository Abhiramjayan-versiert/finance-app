import "server-only";
import { isBackendConfigured } from "@/lib/env";
import { getStore } from "@/lib/firebase/admin";

/** Records an error for the admin System Health view without leaking details to users. */
export async function logServerError(error: unknown, path?: string, userId?: string | null, source: "server" | "client" | "cron" | "auth" = "server") {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 2000);
  console.error(`[finance-os] ${path ?? "unknown"}:`, error);
  if (!isBackendConfigured()) return;
  try {
    const s = getStore();
    await s.create(`app_errors/${s.newId()}`, { message, path: path?.slice(0, 300) ?? null, user_id: userId ?? null, source, created_at: new Date().toISOString() });
  } catch {
    // never throw from the error logger
  }
}
