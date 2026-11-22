import { NextResponse } from "next/server";
import { NATIVE_RELEASES } from "@/lib/releases";

export const dynamic = "force-dynamic";

/** The live web build and the latest native app versions. Public; no user data. */
export function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  return NextResponse.json({ build, native: NATIVE_RELEASES }, { headers: { "Cache-Control": "no-store" } });
}
