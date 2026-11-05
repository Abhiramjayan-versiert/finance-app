import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Public liveness/readiness probe. Reveals no configuration details. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false, db: "unconfigured" }, { status: 503 });
  const t = Date.now();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("platform_settings").select("key").limit(1);
    return NextResponse.json({ ok: !error, db: error ? "error" : "ok", latencyMs: Date.now() - t }, { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }
}
