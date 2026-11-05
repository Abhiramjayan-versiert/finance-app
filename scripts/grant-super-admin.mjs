#!/usr/bin/env node
// Grants the super_admin role to an existing, verified account.
// Usage: SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... npm run admin:grant -- you@example.com
// Runs server-side only; the service-role key never reaches the browser.
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!email || !url || !key) {
  console.error("Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run admin:grant -- <email>");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: profile, error } = await db.from("profiles").select("id, email").ilike("email", email).maybeSingle();
if (error || !profile) {
  console.error(`No account found for ${email}. Register and verify the account first.`);
  process.exit(1);
}
const { data: authUser } = await db.auth.admin.getUserById(profile.id);
if (!authUser?.user?.email_confirmed_at) {
  console.error("That account has not verified its email yet.");
  process.exit(1);
}
const { error: roleErr } = await db.from("user_roles").upsert({ user_id: profile.id, role: "super_admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
if (roleErr) {
  console.error("Failed to grant role:", roleErr.message);
  process.exit(1);
}
await db.from("audit_logs").insert({ actor_id: null, actor_email: "cli:grant-super-admin", action: "role.granted", target_type: "user", target_id: profile.id, metadata: { role: "super_admin", via: "cli" } });
console.log(`✓ ${profile.email} is now a super admin. Sign in and open /admin.`);
