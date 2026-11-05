import { randomUUID } from "node:crypto";
import { AlreadyExistsError, NotFoundError, type Doc, type ListOptions, type Store, type Tx, type Where } from "./store";

/**
 * In-memory Store with Firestore-like semantics, used by tests. Transactions
 * are fully serialised (a global lock), which models Firestore's guarantee
 * that conflicting transactions never both commit.
 */
export function memoryStore(): Store & { dump(): Map<string, Doc> } {
  const docs = new Map<string, Doc>();
  let lock: Promise<void> = Promise.resolve();
  const clone = <T>(v: T): T => structuredClone(v);
  const parent = (path: string) => path.split("/").slice(0, -1).join("/");
  const idOf = (path: string) => path.split("/").at(-1)!;

  function match(d: Doc, where: Where[] = []) {
    return where.every(([f, op, v]) => {
      const x = d[f] as never;
      switch (op) {
        case "==": return x === v;
        case "<": return x < (v as never);
        case "<=": return x <= (v as never);
        case ">": return x > (v as never);
        case ">=": return x >= (v as never);
        case "in": return (v as unknown[]).includes(x);
      }
    });
  }

  const read = (path: string) => (docs.has(path) ? ({ ...clone(docs.get(path)!), id: idOf(path) } as never) : null);
  const write = {
    create(path: string, data: Doc) {
      if (docs.has(path)) throw new AlreadyExistsError("Document already exists");
      docs.set(path, clone(data));
    },
    set(path: string, data: Doc, merge?: boolean) {
      docs.set(path, merge && docs.has(path) ? { ...docs.get(path)!, ...clone(data) } : clone(data));
    },
    update(path: string, data: Doc) {
      if (!docs.has(path)) throw new NotFoundError("Document not found");
      docs.set(path, { ...docs.get(path)!, ...clone(data) });
    },
    delete(path: string) {
      docs.delete(path);
    },
  };

  const store: Store & { dump(): Map<string, Doc> } = {
    dump: () => docs,
    async get(path) {
      return read(path);
    },
    async list(collection, opts: ListOptions = {}) {
      let rows = [...docs.entries()].filter(([p, d]) => parent(p) === collection && match(d, opts.where)).map(([p, d]) => ({ ...clone(d), id: idOf(p) }) as Doc & { id: string });
      if (opts.orderBy) {
        const [f, dir] = opts.orderBy;
        const key = (r: Doc & { id: string }) => (f === "__id__" ? r.id : (r[f] as string));
        rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (dir === "desc" ? -1 : 1));
        if (opts.startAfter !== undefined) rows = rows.filter((r) => (dir === "desc" ? key(r) < (opts.startAfter as string) : key(r) > (opts.startAfter as string)));
      }
      return (opts.limit ? rows.slice(0, opts.limit) : rows) as never;
    },
    async count(collection, where) {
      return (await store.list(collection, { where })).length;
    },
    async create(path, data) {
      write.create(path, data);
    },
    async set(path, data, merge) {
      write.set(path, data, merge);
    },
    async update(path, data) {
      write.update(path, data);
    },
    async delete(path) {
      write.delete(path);
    },
    async deleteTree(path) {
      for (const k of [...docs.keys()]) if (k === path || k.startsWith(`${path}/`)) docs.delete(k);
    },
    async transaction(fn) {
      const prev = lock;
      let release!: () => void;
      lock = new Promise((r) => (release = r));
      await prev;
      try {
        const pending: Array<() => void> = [];
        const tx: Tx = {
          async get(path) {
            await new Promise((r) => setImmediate(r)); // let other callers queue up
            return read(path);
          },
          create: (path, data) => void pending.push(() => write.create(path, data)),
          set: (path, data, merge) => void pending.push(() => write.set(path, data, merge)),
          update: (path, data) => void pending.push(() => write.update(path, data)),
          delete: (path) => void pending.push(() => write.delete(path)),
        };
        const result = await fn(tx);
        // Validate creates before committing anything (all-or-nothing).
        const snapshot = new Map(docs);
        try {
          for (const op of pending) op();
        } catch (e) {
          docs.clear();
          for (const [k, v] of snapshot) docs.set(k, v);
          throw e;
        }
        return result;
      } finally {
        release();
      }
    },
    newId: () => randomUUID().replace(/-/g, "").slice(0, 20),
  };
  return store;
}
