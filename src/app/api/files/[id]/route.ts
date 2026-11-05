import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { DOC_ID, userPath } from "@/lib/firebase/store";

export const dynamic = "force-dynamic";

/** Streams one of the signed-in user's own files. Other users' ids simply don't exist under this path. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || !user.emailVerified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!DOC_ID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const f = await getStore().get<{ content_type: string; data: string }>(userPath(user.uid, "files", id));
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(f.data, "base64"), {
    headers: { "Content-Type": f.content_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" },
  });
}
