import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { serverEnv } from "@/lib/env.server";
import { firestoreStore } from "./firestore-store";
import type { Store } from "./store";
import { fakeAuth, fakeMode, fakeState } from "./fake";

let app: App | undefined;
let store: Store | undefined;

/** Firebase Admin app (server only). Credentials come from environment variables. */
export function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]);
  const { projectId, clientEmail, privateKey } = serverEnv.firebase;
  if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase Admin credentials are not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)");
  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  return app;
}

/** Firebase Admin Auth (or the in-memory fake in E2E test mode). */
export const adminAuth = (): ReturnType<typeof getAuth> => (fakeMode() ? (fakeAuth as unknown as ReturnType<typeof getAuth>) : getAuth(adminApp()));

export function getStore(): Store {
  if (store) return store;
  if (fakeMode()) return fakeState().store;
  const db = getFirestore(adminApp());
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings can only be applied once per instance
  }
  return (store = firestoreStore(db));
}

/** Test hook: inject an in-memory store. */
export function __setStoreForTests(s: Store) {
  store = s;
}
