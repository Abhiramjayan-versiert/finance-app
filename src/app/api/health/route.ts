import { NextResponse } from "next/server";
import { getStore } from "@/lib/firebase/admin";
import { isBackendConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Public liveness/readiness probe. Reveals no configuration details. */
export async function GET() {
  if (!isBackendConfigured()) return NextResponse.json({ ok: false, db: "unconfigured" }, { status: 503 });
  const t = Date.now();
  try {
    await getStore().get("platform/settings");
    return NextResponse.json({ ok: true, db: "ok", latencyMs: Date.now() - t }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    // Log the reason server-side (visible in Vercel runtime logs); never echo it to clients.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[health] database check failed:", msg.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[redacted key]").slice(0, 500));
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }
}
