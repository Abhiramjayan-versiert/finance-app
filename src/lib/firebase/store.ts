/**
 * Minimal document-store abstraction used by all server code.
 * Production: Firestore via the Admin SDK (firestore-store.ts).
 * Tests: an in-memory implementation with serialised transactions (memory-store.ts).
 *
 * Paths are slash-separated ("users/{uid}/transactions/{id}"). Every user-owned
 * document lives under users/{uid}/…, and the uid always comes from the verified
 * session — never from client input — so one user can never address another's data.
 */

export type Doc = Record<string, unknown>;
export type WhereOp = "==" | "<" | "<=" | ">" | ">=" | "in";
export type Where = [field: string, op: WhereOp, value: unknown];

export interface ListOptions {
  where?: Where[];
  orderBy?: [field: string, dir: "asc" | "desc"];
  limit?: number;
  startAfter?: unknown;
}

export class AlreadyExistsError extends Error {
  code = "already-exists" as const;
}
export class NotFoundError extends Error {
  code = "not-found" as const;
}
/** Domain rule violated inside a ledger operation (shown to the user). */
export class LedgerError extends Error {}

export interface Tx {
  get<T = Doc>(path: string): Promise<(T & { id: string }) | null>;
  create(path: string, data: Doc): void;
  set(path: string, data: Doc, merge?: boolean): void;
  update(path: string, data: Doc): void;
  delete(path: string): void;
}

export interface Store {
  get<T = Doc>(path: string): Promise<(T & { id: string }) | null>;
  list<T = Doc>(collection: string, opts?: ListOptions): Promise<Array<T & { id: string }>>;
  count(collection: string, where?: Where[]): Promise<number>;
  create(path: string, data: Doc): Promise<void>;
  set(path: string, data: Doc, merge?: boolean): Promise<void>;
  update(path: string, data: Doc): Promise<void>;
  delete(path: string): Promise<void>;
  /** Deletes a document and all of its subcollections. */
  deleteTree(path: string): Promise<void>;
  transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
  newId(): string;
}

export const userPath = (uid: string, ...rest: string[]) => ["users", uid, ...rest].join("/");

/** Firestore document ids we accept from clients (auto-ids, UUIDs, composite keys). */
export const DOC_ID = /^[A-Za-z0-9_-]{1,80}$/;
