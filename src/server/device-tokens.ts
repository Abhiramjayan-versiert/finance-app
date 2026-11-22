import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";

/**
 * "Remember this device" for the installed phone apps.
 *
 * Android's WebView can lose its cookie jar when the app is closed, which used
 * to sign people out. After sign-in the app stores a device key in native
 * app storage (written synchronously); if the session cookie is gone, the key
 * silently restores the session.
 *
 * Token format: `${uid}.${deviceId}.${secret}`. Only sha256(secret) is stored,
 * at users/{uid}/devices/{deviceId}. Keys are single-use (rotated on every
 * resume), expire after 60 days, are removed on sign-out, password change and
 * account deletion, and never work for disabled or suspended accounts.
 */
const TTL_MS = 60 * 24 * 60 * 60 * 1000;
const ID = /^[A-Za-z0-9_-]{6,64}$/;

interface DeviceDoc {
  secret_hash: string;
  created_at: string;
  last_used_at: string;
  expires_at: number;
  platform: string;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export async function issueDeviceToken(uid: string, platform: string): Promise<string> {
  const deviceId = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  await getStore().set(userPath(uid, "devices", deviceId), {
    secret_hash: hash(secret),
    created_at: now,
    last_used_at: now,
    expires_at: Date.now() + TTL_MS,
    platform: platform.slice(0, 20),
  } satisfies DeviceDoc as unknown as Record<string, unknown>);
  return `${uid}.${deviceId}.${secret}`;
}

function parse(token: string) {
  const [uid, deviceId, secret, extra] = String(token ?? "").split(".");
  if (extra !== undefined || !uid || !deviceId || !secret || !ID.test(uid) || !ID.test(deviceId) || secret.length < 20 || secret.length > 100) return null;
  return { uid, deviceId, secret };
}

/** Validates and burns a device key. Returns the uid, or null if invalid/expired. */
export async function consumeDeviceToken(token: string): Promise<{ uid: string; platform: string } | null> {
  const p = parse(token);
  if (!p) return null;
  const s = getStore();
  const path = userPath(p.uid, "devices", p.deviceId);
  const doc = await s.get<DeviceDoc>(path);
  if (!doc) return null;
  const a = Buffer.from(hash(p.secret), "hex");
  const b = Buffer.from(doc.secret_hash, "hex");
  const valid = a.length === b.length && timingSafeEqual(a, b) && doc.expires_at > Date.now();
  await s.delete(path); // single use, valid or not
  return valid ? { uid: p.uid, platform: doc.platform } : null;
}

export async function revokeDeviceToken(token: string) {
  const p = parse(token);
  if (!p) return;
  const s = getStore();
  const path = userPath(p.uid, "devices", p.deviceId);
  const doc = await s.get<DeviceDoc>(path);
  if (doc && doc.secret_hash === hash(p.secret)) await s.delete(path);
}

/** Signs every remembered device out (password change, admin action). */
export async function revokeAllDeviceTokens(uid: string) {
  await getStore().deleteTree(userPath(uid, "devices"));
}
