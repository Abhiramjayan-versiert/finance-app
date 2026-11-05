"use server";

import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { fail, guarded, ok, type ActionResult } from "@/lib/security/actions";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * Private file uploads (receipts, goal images, profile photos) stored as
 * documents under users/{uid}/files. Firestore's free tier needs no separate
 * storage bucket; files are capped at 700 KB (Firestore's 1 MiB document limit).
 * Images are compressed in the browser before upload.
 */
const MAX_BYTES = 700 * 1024;
const TYPES: Record<string, string[]> = {
  receipt: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  goal: ["image/jpeg", "image/png", "image/webp"],
  avatar: ["image/jpeg", "image/png", "image/webp"],
};

function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

export async function uploadFileAction(fd: FormData): Promise<ActionResult<{ path: string }>> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!(await rateLimit("upload", [ws.userId], 30, 600))) return fail("Too many uploads. Try again in a few minutes.");
    const purpose = String(fd.get("purpose") ?? "");
    const file = fd.get("file");
    if (!TYPES[purpose] || !(file instanceof File)) return fail("Invalid upload");
    if (file.size > MAX_BYTES) return fail("File is too large (max 700 KB). Try a smaller photo or PDF.");
    const buf = Buffer.from(await file.arrayBuffer());
    const type = sniff(buf); // trust file contents, not the browser-declared type
    if (!type || !TYPES[purpose].includes(type)) return fail("Unsupported file type.");
    const store = getStore();
    const id = store.newId();
    await store.create(userPath(ws.userId, "files", id), { user_id: ws.userId, purpose, content_type: type, size: buf.length, data: buf.toString("base64"), created_at: new Date().toISOString() });
    return ok(undefined, { path: `${ws.userId}/${id}` });
  }, "uploadFile");
}
