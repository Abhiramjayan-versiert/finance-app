import { NextResponse, type NextRequest } from "next/server";
import { fakeMode, fakeState } from "@/lib/firebase/fake";

export const dynamic = "force-dynamic";

/** E2E-only: exposes emails captured by the fake backend. 404 everywhere else. */
export async function GET(req: NextRequest) {
  if (!fakeMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const to = req.nextUrl.searchParams.get("to")?.toLowerCase();
  return NextResponse.json(fakeState().outbox.filter((m) => !to || m.to === to));
}

/** E2E-only: promote a user to super admin. */
export async function POST(req: NextRequest) {
  if (!fakeMode()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { email } = (await req.json()) as { email: string };
  const u = [...fakeState().users.values()].find((x) => x.email === email.toLowerCase());
  if (!u) return NextResponse.json({ error: "no user" }, { status: 404 });
  await fakeState().store.update(`users/${u.uid}`, { roles: ["super_admin"] });
  return NextResponse.json({ ok: true });
}
