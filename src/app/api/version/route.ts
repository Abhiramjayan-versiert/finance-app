import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The build currently serving traffic. Public; contains no user data. */
export function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  return NextResponse.json({ build }, { headers: { "Cache-Control": "no-store" } });
}
