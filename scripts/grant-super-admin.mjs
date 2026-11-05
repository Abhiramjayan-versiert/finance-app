#!/usr/bin/env node
// Grants the super_admin role to an existing, verified account.
// Usage (reads the same env vars as the app, e.g. from .env.local):
//   node --env-file=.env.local scripts/grant-super-admin.mjs you@example.com
// Runs server-side only; the service-account key never reaches the browser.
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail } = process.env;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
if (!email || !projectId || !clientEmail || !privateKey) {
  console.error("Usage: node --env-file=.env.local scripts/grant-super-admin.mjs <email>\nRequires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.");
  process.exit(1);
}
const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
const user = await getAuth(app).getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No account found for ${email}. Register in the app first.`);
  process.exit(1);
}
if (!user.emailVerified) {
  console.error("That account has not verified its email yet.");
  process.exit(1);
}
const db = getFirestore(app);
const ref = db.doc(`users/${user.uid}`);
const snap = await ref.get();
if (!snap.exists) {
  console.error("Workspace not found. Sign in to the app once, then re-run.");
  process.exit(1);
}
const roles = new Set(snap.get("roles") ?? []);
roles.add("super_admin");
await ref.update({ roles: [...roles] });
await db.collection("audit_logs").add({ actor_id: null, actor_email: "cli:grant-super-admin", action: "role.granted", target_type: "user", target_id: user.uid, metadata: { role: "super_admin", via: "cli" }, ip_address: null, created_at: new Date().toISOString() });
console.log(`✓ ${email} is now a super admin. Sign in and open /admin.`);
process.exit(0);
