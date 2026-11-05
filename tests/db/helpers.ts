import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Spins up a fresh database on a local PostgreSQL server, installs a minimal
 * Supabase stand-in (roles + auth.uid()) and applies every migration.
 * Set TEST_DATABASE_URL to a superuser connection (database is ignored).
 */
export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";

export async function freshDatabase(name: string): Promise<string> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  const c = new Client({ connectionString: url });
  await c.connect();
  const root = path.resolve(__dirname, "../..");
  await c.query(readFileSync(path.join(root, "tests/db/supabase-stub.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await c.query(readFileSync(path.join(dir, f), "utf8"));
  await c.end();
  return url;
}

export async function connect(url: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Run statements as an authenticated Supabase user inside a transaction. */
export async function asUser<T>(c: Client, uid: string | null, fn: () => Promise<T>, commit = true): Promise<T> {
  await c.query("begin");
  try {
    await c.query(`set local role ${uid ? "authenticated" : "anon"}`);
    if (uid) await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const r = await fn();
    await c.query(commit ? "commit" : "rollback");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

export async function createUser(c: Client, email: string, name = "Test User"): Promise<string> {
  const { rows } = await c.query(`insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id`, [email, JSON.stringify({ full_name: name, terms_accepted: "true" })]);
  return rows[0].id;
}
