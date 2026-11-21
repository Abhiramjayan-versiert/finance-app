import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { publicEnv } from "@/lib/env";

/**
 * Passkeys (WebAuthn) — "Sign in with Face ID / fingerprint".
 *
 * Storage (server-only; Firestore is closed to browsers):
 *   users/{uid}/passkeys/{sha256(credentialId)}  credential public key + counter
 *   passkey_index/{sha256(credentialId)}         → { uid } for usernameless sign-in
 *   webauthn_challenges/{id}                     one-time challenge, 5 min TTL,
 *                                                referenced by an httpOnly cookie
 * Biometrics never leave the device; we only ever see a public key and signatures.
 */

const CHALLENGE_COOKIE = "__fos_wa";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RP_NAME = "FINANCE OS";
/** Production addresses of this app (passkeys are bound to the address they were created on). */
const KNOWN_HOSTS = ["finance-os-versiert-solutions.vercel.app", "finance-os-omega-bice.vercel.app"];

export interface StoredPasskey {
  credential_id: string; // base64url
  public_key: string; // base64url
  counter: number;
  transports: AuthenticatorTransport[];
  name: string;
  device_type: string;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

export const keyId = (credentialId: string) => createHash("sha256").update(credentialId).digest("hex");
const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

/** The relying party is the host the user is on, limited to our own deployments. */
async function relyingParty() {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const allowed = new Set(
    [publicEnv.siteUrl, ...KNOWN_HOSTS, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, ...(process.env.PASSKEY_EXTRA_HOSTS ?? "").split(",")]
      .filter(Boolean)
      .map((v) => v!.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase()),
  );
  if (!host || !allowed.has(host)) throw new PasskeyError("Passkeys aren't available on this address.");
  const hostname = host.replace(/:\d+$/, "");
  const secure = !(hostname === "localhost" || hostname === "127.0.0.1");
  return { rpID: hostname, origin: `${secure ? "https" : "http"}://${host}` };
}

export class PasskeyError extends Error {}

async function saveChallenge(challenge: string, kind: "register" | "login", uid: string | null) {
  const id = randomBytes(18).toString("base64url");
  await getStore().set(`webauthn_challenges/${id}`, { challenge, kind, uid, expires_at: Date.now() + CHALLENGE_TTL_MS });
  (await cookies()).set(CHALLENGE_COOKIE, id, { httpOnly: true, sameSite: "strict", secure: publicEnv.siteUrl.startsWith("https://"), path: "/", maxAge: CHALLENGE_TTL_MS / 1000 });
}

/** Reads and burns the pending challenge (single use). */
async function takeChallenge(kind: "register" | "login", uid: string | null) {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!id || !/^[A-Za-z0-9_-]{10,40}$/.test(id)) throw new PasskeyError("This request expired. Please try again.");
  const s = getStore();
  const doc = await s.get<{ challenge: string; kind: string; uid: string | null; expires_at: number }>(`webauthn_challenges/${id}`);
  await s.delete(`webauthn_challenges/${id}`).catch(() => {});
  if (!doc || doc.kind !== kind || doc.expires_at < Date.now() || (kind === "register" && doc.uid !== uid)) throw new PasskeyError("This request expired. Please try again.");
  return doc.challenge;
}

export async function listPasskeys(uid: string) {
  const rows = await getStore().list<StoredPasskey>(userPath(uid, "passkeys"));
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function registrationOptions(uid: string, email: string, displayName: string) {
  const { rpID } = await relyingParty();
  const existing = await listPasskeys(uid);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(uid),
    userName: email,
    userDisplayName: displayName || email,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  await saveChallenge(options.challenge, "register", uid);
  return options;
}

export async function verifyRegistration(uid: string, response: RegistrationResponseJSON, suggestedName: string) {
  const { rpID, origin } = await relyingParty();
  const expectedChallenge = await takeChallenge("register", uid);
  const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
  if (!v.verified) throw new PasskeyError("Face ID setup could not be verified. Please try again.");
  const info = v.registrationInfo;
  const cred = info.credential;
  const id = keyId(cred.id);
  const friendly = info.passkeyProviderMetadata?.friendlyNames as Record<string, string> | undefined;
  const provider = friendly ? (friendly["en-US"] ?? friendly.en ?? Object.values(friendly)[0]) : undefined;
  const name = (provider || suggestedName || "Passkey").slice(0, 60);
  const s = getStore();
  const owner = await s.get<{ uid: string }>(`passkey_index/${id}`);
  if (owner && owner.uid !== uid) throw new PasskeyError("This passkey is already linked to another account.");
  const record: StoredPasskey = {
    credential_id: cred.id,
    public_key: b64u(cred.publicKey),
    counter: cred.counter,
    transports: (cred.transports ?? []) as AuthenticatorTransport[],
    name,
    device_type: info.credentialDeviceType,
    backed_up: info.credentialBackedUp,
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  await s.set(userPath(uid, "passkeys", id), record as unknown as Record<string, unknown>);
  await s.set(`passkey_index/${id}`, { uid, created_at: record.created_at });
  return { id, name };
}

export async function authenticationOptions() {
  const { rpID } = await relyingParty();
  // Usernameless: the device offers the user's passkeys for this site.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: [] });
  await saveChallenge(options.challenge, "login", null);
  return options;
}

/** Verifies a passkey assertion and returns the account it belongs to. */
export async function verifyAuthentication(response: AuthenticationResponseJSON): Promise<string> {
  const { rpID, origin } = await relyingParty();
  const expectedChallenge = await takeChallenge("login", null);
  if (typeof response?.id !== "string" || response.id.length > 1400) throw new PasskeyError("That passkey isn't recognised.");
  const id = keyId(response.id);
  const s = getStore();
  const owner = await s.get<{ uid: string }>(`passkey_index/${id}`);
  const stored = owner ? await s.get<StoredPasskey>(userPath(owner.uid, "passkeys", id)) : null;
  if (!owner || !stored) {
    if (owner) await s.delete(`passkey_index/${id}`).catch(() => {});
    throw new PasskeyError("That passkey isn't linked to an account. Sign in with your password, then set up Face ID in Settings.");
  }
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: { id: stored.credential_id, publicKey: fromB64u(stored.public_key), counter: stored.counter, transports: stored.transports },
  });
  if (!v.verified) throw new PasskeyError("Face ID sign-in could not be verified.");
  await s.update(userPath(owner.uid, "passkeys", id), { counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() });
  return owner.uid;
}

export async function deletePasskey(uid: string, id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new PasskeyError("Unknown passkey.");
  const s = getStore();
  const stored = await s.get(userPath(uid, "passkeys", id));
  if (!stored) throw new PasskeyError("Unknown passkey.");
  await s.delete(userPath(uid, "passkeys", id));
  const owner = await s.get<{ uid: string }>(`passkey_index/${id}`);
  if (owner?.uid === uid) await s.delete(`passkey_index/${id}`);
}

/** Removes every passkey index entry for an account (used on account deletion). */
export async function deleteAllPasskeys(uid: string) {
  const s = getStore();
  for (const p of await listPasskeys(uid)) {
    const owner = await s.get<{ uid: string }>(`passkey_index/${p.id}`);
    if (owner?.uid === uid) await s.delete(`passkey_index/${p.id}`).catch(() => {});
  }
}
