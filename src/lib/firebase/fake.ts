import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { memoryStore } from "./memory-store";
import type { Store } from "./store";

/**
 * In-process stand-in for Firebase Auth + Firestore, used ONLY for automated
 * end-to-end tests. Enabled when FINANCE_OS_FAKE_BACKEND=1 and never on Vercel.
 */
export function fakeMode(): boolean {
  return process.env.FINANCE_OS_FAKE_BACKEND === "1" && !process.env.VERCEL;
}

interface FakeUser {
  uid: string;
  email: string;
  password: string;
  displayName?: string;
  emailVerified: boolean;
  disabled: boolean;
  validAfter: number;
  lastSignIn: number | null;
}

interface FakeState {
  store: Store;
  users: Map<string, FakeUser>;
  sessions: Map<string, { uid: string; issued: number }>;
  tokens: Map<string, { uid: string; issued: number }>;
  outbox: Array<{ to: string; subject: string; text: string; at: number }>;
}

const g = globalThis as unknown as { __fosFake?: FakeState };
export function fakeState(): FakeState {
  if (!g.__fosFake) {
    console.warn("[finance-os] FAKE BACKEND ENABLED — in-memory data, for automated tests only");
    g.__fosFake = { store: memoryStore(), users: new Map(), sessions: new Map(), tokens: new Map(), outbox: [] };
  }
  return g.__fosFake;
}

const err = (code: string) => Object.assign(new Error(code), { code });
const byEmail = (email: string) => [...fakeState().users.values()].find((u) => u.email === email.toLowerCase());
const record = (u: FakeUser) => ({ uid: u.uid, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName, disabled: u.disabled, metadata: { lastSignInTime: u.lastSignIn ? new Date(u.lastSignIn).toUTCString() : undefined } });
const issue = (uid: string) => {
  const t = randomBytes(16).toString("hex");
  fakeState().tokens.set(t, { uid, issued: Date.now() });
  return t;
};

export const fakeAuth = {
  async createUser(p: { email: string; password: string; displayName?: string; emailVerified?: boolean }) {
    if (byEmail(p.email)) throw err("auth/email-already-exists");
    const u: FakeUser = { uid: randomUUID().replace(/-/g, "").slice(0, 28), email: p.email.toLowerCase(), password: p.password, displayName: p.displayName, emailVerified: !!p.emailVerified, disabled: false, validAfter: 0, lastSignIn: null };
    fakeState().users.set(u.uid, u);
    return record(u);
  },
  async getUser(uid: string) {
    const u = fakeState().users.get(uid);
    if (!u) throw err("auth/user-not-found");
    return record(u);
  },
  async getUserByEmail(email: string) {
    const u = byEmail(email);
    if (!u) throw err("auth/user-not-found");
    return record(u);
  },
  async getUsers(ids: Array<{ uid: string }>) {
    return { users: ids.map((i) => fakeState().users.get(i.uid)).filter(Boolean).map((u) => record(u!)) };
  },
  async listUsers() {
    return { users: [...fakeState().users.values()].map(record), pageToken: undefined };
  },
  async updateUser(uid: string, p: { password?: string; emailVerified?: boolean; displayName?: string; disabled?: boolean }) {
    const u = fakeState().users.get(uid);
    if (!u) throw err("auth/user-not-found");
    Object.assign(u, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)));
    return record(u);
  },
  async deleteUser(uid: string) {
    fakeState().users.delete(uid);
  },
  async revokeRefreshTokens(uid: string) {
    const u = fakeState().users.get(uid);
    if (u) u.validAfter = Date.now();
  },
  async createCustomToken(uid: string) {
    return `custom:${uid}`;
  },
  async createSessionCookie(idToken: string) {
    const t = fakeState().tokens.get(idToken);
    if (!t) throw err("auth/invalid-id-token");
    const c = randomBytes(24).toString("hex");
    fakeState().sessions.set(c, { uid: t.uid, issued: Date.now() + 1 });
    return c;
  },
  async verifySessionCookie(cookie: string) {
    const s = fakeState().sessions.get(cookie);
    const u = s && fakeState().users.get(s.uid);
    if (!s || !u || u.disabled || s.issued <= u.validAfter) {
      if (process.env.FAKE_DEBUG) console.log("FAKE verify fail", { found: !!s, user: !!u, disabled: u?.disabled, issued: s?.issued, validAfter: u?.validAfter, sessions: fakeState().sessions.size });
      throw err("auth/session-cookie-revoked");
    }
    return { uid: u.uid, email: u.email, email_verified: u.emailVerified };
  },
};

export const fakeIdentity = {
  async signInWithPassword(email: string, password: string) {
    const u = byEmail(email);
    if (!u || u.password !== password) throw Object.assign(new Error("INVALID_LOGIN_CREDENTIALS"), { identity: "INVALID_LOGIN_CREDENTIALS" });
    if (u.disabled) throw Object.assign(new Error("USER_DISABLED"), { identity: "USER_DISABLED" });
    u.lastSignIn = Date.now();
    return { idToken: issue(u.uid), localId: u.uid, email: u.email };
  },
  async signInWithCustomToken(token: string) {
    return { idToken: issue(token.replace(/^custom:/, "")) };
  },
  async sendOob(to: string, kind: string) {
    fakeState().outbox.push({ to, subject: kind, text: `[${kind} link]`, at: Date.now() });
  },
};

export function fakeSendEmail(to: string, subject: string, text: string) {
  fakeState().outbox.push({ to: to.toLowerCase(), subject, text, at: Date.now() });
  return true;
}
