import "server-only";
import { FieldPath, type Firestore, type Query } from "firebase-admin/firestore";
import { AlreadyExistsError, NotFoundError, type Doc, type ListOptions, type Store, type Tx, type Where } from "./store";

function isCode(e: unknown, code: number | string) {
  const c = (e as { code?: unknown })?.code;
  return c === code || (typeof code === "number" && c === String(code));
}

function applyWhere(q: Query, where: Where[] = []) {
  for (const [f, op, v] of where) q = q.where(f, op, v);
  return q;
}

export function firestoreStore(db: Firestore): Store {
  return {
    async get(path) {
      const s = await db.doc(path).get();
      return s.exists ? ({ ...(s.data() as Doc), id: s.id } as never) : null;
    },
    async list(collection, opts: ListOptions = {}) {
      let q: Query = applyWhere(db.collection(collection), opts.where);
      if (opts.orderBy) q = q.orderBy(opts.orderBy[0] === "__id__" ? FieldPath.documentId() : opts.orderBy[0], opts.orderBy[1]);
      if (opts.startAfter !== undefined) q = q.startAfter(opts.startAfter);
      if (opts.limit) q = q.limit(opts.limit);
      const snap = await q.get();
      return snap.docs.map((d) => ({ ...(d.data() as Doc), id: d.id })) as never;
    },
    async count(collection, where) {
      const snap = await applyWhere(db.collection(collection), where).count().get();
      return snap.data().count;
    },
    async create(path, data) {
      try {
        await db.doc(path).create(data);
      } catch (e) {
        if (isCode(e, 6) || isCode(e, "already-exists")) throw new AlreadyExistsError("Document already exists");
        throw e;
      }
    },
    async set(path, data, merge) {
      await db.doc(path).set(data, { merge: !!merge });
    },
    async update(path, data) {
      try {
        await db.doc(path).update(data);
      } catch (e) {
        if (isCode(e, 5) || isCode(e, "not-found")) throw new NotFoundError("Document not found");
        throw e;
      }
    },
    async delete(path) {
      await db.doc(path).delete();
    },
    async deleteTree(path) {
      await db.recursiveDelete(db.doc(path));
    },
    async transaction(fn) {
      try {
        return await db.runTransaction(async (t) => {
          const tx: Tx = {
            async get(path) {
              const s = await t.get(db.doc(path));
              return s.exists ? ({ ...(s.data() as Doc), id: s.id } as never) : null;
            },
            create: (path, data) => void t.create(db.doc(path), data),
            set: (path, data, merge) => void t.set(db.doc(path), data, { merge: !!merge }),
            update: (path, data) => void t.update(db.doc(path), data),
            delete: (path) => void t.delete(db.doc(path)),
          };
          return fn(tx);
        });
      } catch (e) {
        if (isCode(e, 6) || isCode(e, "already-exists")) throw new AlreadyExistsError("Document already exists");
        throw e;
      }
    },
    newId: () => db.collection("_").doc().id,
  };
}
