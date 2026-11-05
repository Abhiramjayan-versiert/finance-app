"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminAuth, getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { audit } from "@/lib/security/audit";
import { uuid, formDataToObject } from "@/lib/validation/common";
import { fail, guarded, ok, type ActionResult } from "@/lib/security/actions";
import type { UserDoc } from "@/server/data/users";
import { DEFAULT_TEMPLATES } from "@/server/data/defaults";
import { getDefaultCategories } from "@/server/data/users";

/**
 * Every admin mutation re-verifies the caller's role on the server and writes
 * an audit log entry. None of these read users' financial records.
 */
async function ctx(minRole: "admin" | "super_admin" = "admin") {
  const ws = await requireAdmin(minRole);
  return { ws, store: getStore(), actor: { id: ws.userId, email: ws.email } };
}

async function targetRoles(uid: string) {
  return (await getStore().get<UserDoc>(userPath(uid)))?.roles ?? [];
}

const suspendSchema = z.object({ userId: uuid, reason: z.string().trim().max(300).optional() });

export async function suspendUserAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, store, actor } = await ctx();
    const p = suspendSchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid request");
    if (p.data.userId === ws.userId) return fail("You cannot suspend your own account.");
    if ((await targetRoles(p.data.userId)).includes("super_admin")) return fail("Super admins cannot be suspended.");
    await store.update(userPath(p.data.userId), { status: "suspended", suspended_reason: p.data.reason ?? null });
    await adminAuth().updateUser(p.data.userId, { disabled: true });
    await adminAuth().revokeRefreshTokens(p.data.userId); // invalidates existing sessions
    await audit(actor, "user.suspended", { type: "user", id: p.data.userId }, { reason: p.data.reason ?? null });
    revalidatePath("/admin/users");
    return ok("User suspended");
  }, "admin.suspend");
}

export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  return guarded(async () => {
    const { store, actor } = await ctx();
    if (!uuid.safeParse(userId).success) return fail("Invalid user");
    await store.update(userPath(userId), { status: "active", suspended_reason: null });
    await adminAuth().updateUser(userId, { disabled: false });
    await audit(actor, "user.reactivated", { type: "user", id: userId });
    revalidatePath("/admin/users");
    return ok("User reactivated");
  }, "admin.reactivate");
}

const deleteSchema = z.object({ userId: uuid, confirmEmail: z.string().trim().toLowerCase() });

export async function deleteUserAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, store, actor } = await ctx("super_admin");
    const p = deleteSchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid request");
    if (p.data.userId === ws.userId) return fail("You cannot delete your own account here.");
    const doc = await store.get<UserDoc>(userPath(p.data.userId));
    if (!doc) return fail("User not found");
    if (doc.email.toLowerCase() !== p.data.confirmEmail) return fail("The confirmation email does not match.", { confirmEmail: "Type the user's email exactly" });
    if ((doc.roles ?? []).includes("super_admin")) return fail("Revoke the super admin role before deleting this account.");
    await audit(actor, "user.deleted", { type: "user", id: p.data.userId }, { email: doc.email });
    await store.deleteTree(userPath(p.data.userId));
    await adminAuth().deleteUser(p.data.userId).catch(() => {});
    revalidatePath("/admin/users");
    return ok("User and all their data deleted");
  }, "admin.delete");
}

const roleSchema = z.object({ userId: uuid, role: z.enum(["super_admin", "admin", "support"]) });

export async function setRoleAction(userId: string, role: string, grant: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, store, actor } = await ctx("super_admin");
    const p = roleSchema.safeParse({ userId, role });
    if (!p.success) return fail("Invalid request");
    if (!grant && p.data.userId === ws.userId && p.data.role === "super_admin") {
      const supers = await store.count("users", [["roles", "array-contains" as never, "super_admin"]]).catch(async () => (await store.list<UserDoc>("users")).filter((u) => u.roles?.includes("super_admin")).length);
      if (supers <= 1) return fail("You are the last super admin. Grant another super admin first.");
    }
    const roles = new Set(await targetRoles(p.data.userId));
    if (grant) roles.add(p.data.role);
    else roles.delete(p.data.role);
    await store.update(userPath(p.data.userId), { roles: [...roles] });
    await audit(actor, grant ? "role.granted" : "role.revoked", { type: "user", id: p.data.userId }, { role: p.data.role });
    revalidatePath("/admin/users");
    return ok(grant ? `Granted ${p.data.role}` : `Revoked ${p.data.role}`);
  }, "admin.role");
}

const settingsSchema = z.object({
  maintenance_mode: z.preprocess((v) => v === "on", z.boolean()),
  signups_enabled: z.preprocess((v) => v === "on", z.boolean()),
  maintenance_message: z.string().trim().max(500),
  announcement: z.string().trim().max(300),
});

export async function updatePlatformSettingsAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, store, actor } = await ctx("super_admin");
    const p = settingsSchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid settings");
    await store.set("platform/settings", { ...p.data, updated_by: ws.userId, updated_at: new Date().toISOString() }, true);
    await audit(actor, "platform.settings_updated", { type: "platform_settings", id: "global" }, p.data);
    revalidatePath("/", "layout");
    return ok("Platform settings saved");
  }, "admin.settings");
}

const templateSchema = z.object({ id: z.string().regex(/^[a-z_]{3,60}$/), title_template: z.string().trim().min(1).max(200), body_template: z.string().trim().min(1).max(2000), is_active: z.preprocess((v) => v === "on", z.boolean()) });

export async function updateTemplateAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, store, actor } = await ctx();
    const p = templateSchema.safeParse(formDataToObject(fd));
    if (!p.success || !DEFAULT_TEMPLATES[p.data.id]) return fail("Invalid template");
    const { id, ...rest } = p.data;
    await store.set(`notification_templates/${id}`, { ...rest, updated_by: ws.userId, updated_at: new Date().toISOString() });
    await audit(actor, "template.updated", { type: "notification_template", id });
    revalidatePath("/admin/settings");
    return ok("Template saved");
  }, "admin.template");
}

/** Copies the built-in list into Firestore on first edit so admins can manage it. */
async function ensureDefaultCategories() {
  const store = getStore();
  if ((await store.list("default_categories", { limit: 1 })).length) return;
  for (const c of await getDefaultCategories(store)) await store.set(`default_categories/${c.id}`, { kind: c.kind, name: c.name, color: c.color, is_active: true, created_at: new Date().toISOString() });
}

const defaultCategorySchema = z.object({ kind: z.enum(["income", "expense"]), name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });

export async function addDefaultCategoryAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { store, actor } = await ctx();
    const p = defaultCategorySchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid category");
    await ensureDefaultCategories();
    const existing = await store.list<{ kind: string; name: string }>("default_categories");
    if (existing.some((c) => c.kind === p.data.kind && c.name.toLowerCase() === p.data.name.toLowerCase())) return fail("Category already exists");
    await store.create(`default_categories/${store.newId()}`, { ...p.data, is_active: true, created_at: new Date().toISOString() });
    await audit(actor, "default_category.added", { type: "default_category", id: p.data.name }, p.data);
    revalidatePath("/admin/settings");
    return ok("Default category added for new users");
  }, "admin.defaultCategory");
}

export async function toggleDefaultCategoryAction(id: string, active: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const { store, actor } = await ctx();
    if (!uuid.safeParse(id).success) return fail("Invalid category");
    await ensureDefaultCategories();
    if (!(await store.get(`default_categories/${id}`))) return fail("Category not found — refresh the page");
    await store.update(`default_categories/${id}`, { is_active: !!active });
    await audit(actor, active ? "default_category.enabled" : "default_category.disabled", { type: "default_category", id });
    revalidatePath("/admin/settings");
    return ok(active ? "Enabled" : "Disabled");
  }, "admin.toggleDefaultCategory");
}
