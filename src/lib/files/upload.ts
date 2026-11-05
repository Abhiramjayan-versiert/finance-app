"use client";

import { uploadFileAction } from "@/server/actions/files";

/** Downscales large photos in the browser so they fit the 700 KB limit. PDFs are sent as-is. */
async function compress(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size < 300 * 1024) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", quality));
}

export async function uploadPrivateFile(file: File, purpose: "receipt" | "goal" | "avatar"): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const blob = await compress(file);
  const fd = new FormData();
  fd.set("purpose", purpose);
  fd.set("file", new File([blob], file.name, { type: blob.type || file.type }));
  const r = await uploadFileAction(fd);
  return r.ok && r.data ? { ok: true, path: r.data.path } : { ok: false, error: r.ok ? "Upload failed" : r.error };
}

export { fileUrl } from "./url";
