"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/env.server";
import { audit } from "@/lib/security/audit";
import { uuid, formDataToObject } from "@/lib/validation/common";
import { fail, guarded, ok, type ActionResult } from "@/lib/security/actions";

/**
 * Every admin mutation: (1) re-verifies the caller's role on the server,
 * (2) uses the service role only for the specific operation, (3) writes an
 * audit log entry. None of these read user financial records.
 */
async function adminContext(minRole: "admin" | "super_admin" = "admin") {
  const ws = await requireAdmin(minRole);
  if (!isServiceRoleConfigured()) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  return { ws, admin: createAdminClient(), actor: { id: ws.userId, email: ws.email } };
}

const suspendSchema = z.object({ userId: uuid, reason: z.string().trim().max(300).optional() });

export async function suspendUserAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, admin, actor } = await adminContext();
    const p = suspendSchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid request");
    if (p.data.userId === ws.userId) return fail("You cannot suspend your own account.");
    const { data: targetRoles } = await admin.from("user_roles").select("role").eq("user_id", p.data.userId);
    if ((targetRoles ?? []).some((r) => r.role === "super_admin")) return fail("Super admins cannot be suspended.");
    const { error } = await admin.from("profiles").update({ status: "suspended", suspended_reason: p.data.reason ?? null }).eq("id", p.data.userId);
    if (error) return fail("Could not suspend user");
    // Block sign-in / token refresh at the auth layer as well.
    await admin.auth.admin.updateUserById(p.data.userId, { ban_duration: "876000h" });
    await audit(actor, "user.suspended", { type: "user", id: p.data.userId }, { reason: p.data.reason ?? null });
    revalidatePath("/admin/users");
    return ok("User suspended");
  }, "admin.suspend");
}

export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  return guarded(async () => {
    const { admin, actor } = await adminContext();
    if (!uuid.safeParse(userId).success) return fail("Invalid user");
    const { error } = await admin.from("profiles").update({ status: "active", suspended_reason: null }).eq("id", userId);
    if (error) return fail("Could not reactivate user");
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    await audit(actor, "user.reactivated", { type: "user", id: userId });
    revalidatePath("/admin/users");
    return ok("User reactivated");
  }, "admin.reactivate");
}

const deleteSchema = z.object({ userId: uuid, confirmEmail: z.string().trim().toLowerCase() });

export async function deleteUserAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, admin, actor } = await adminContext("super_admin");
    const p = deleteSchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid request");
    if (p.data.userId === ws.userId) return fail("You cannot delete your own account here.");
    const { data: profile } = await admin.from("profiles").select("email").eq("id", p.data.userId).single();
    if (!profile) return fail("User not found");
    if (profile.email.toLowerCase() !== p.data.confirmEmail) return fail("The confirmation email does not match.", { confirmEmail: "Type the user's email exactly" });
    const { data: targetRoles } = await admin.from("user_roles").select("role").eq("user_id", p.data.userId);
    if ((targetRoles ?? []).some((r) => r.role === "super_admin")) return fail("Revoke the super admin role before deleting this account.");
    for (const bucket of ["receipts", "avatars", "goal-images"]) {
      const { data: files } = await admin.storage.from(bucket).list(p.data.userId, { limit: 1000 });
      if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${p.data.userId}/${f.name}`));
    }
    await audit(actor, "user.deleted", { type: "user", id: p.data.userId }, { email: profile.email });
    const { error } = await admin.auth.admin.deleteUser(p.data.userId);
    if (error) return fail("Deletion failed");
    revalidatePath("/admin/users");
    return ok("User and all their data deleted");
  }, "admin.delete");
}

const roleSchema = z.object({ userId: uuid, role: z.enum(["super_admin", "admin", "support"]), grant: z.enum(["true", "false"]) });

export async function setRoleAction(userId: string, role: string, grant: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, admin, actor } = await adminContext("super_admin");
    const p = roleSchema.safeParse({ userId, role, grant: String(grant) });
    if (!p.success) return fail("Invalid request");
    if (!grant && p.data.userId === ws.userId && p.data.role === "super_admin") {
      const { count } = await admin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
      if ((count ?? 0) <= 1) return fail("You are the last super admin. Grant another super admin first.");
    }
    const res = grant
      ? await admin.from("user_roles").upsert({ user_id: p.data.userId, role: p.data.role, granted_by: ws.userId }, { onConflict: "user_id,role", ignoreDuplicates: true })
      : await admin.from("user_roles").delete().eq("user_id", p.data.userId).eq("role", p.data.role);
    if (res.error) return fail("Could not update role");
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
    const { ws, admin, actor } = await adminContext("super_admin");
    const p = settingsSchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid settings");
    for (const [key, value] of Object.entries(p.data)) {
      const { error } = await admin.from("platform_settings").update({ value, updated_by: ws.userId, updated_at: new Date().toISOString() }).eq("key", key);
      if (error) return fail(`Could not save ${key}`);
    }
    await audit(actor, "platform.settings_updated", { type: "platform_settings", id: "global" }, p.data);
    revalidatePath("/", "layout");
    return ok("Platform settings saved");
  }, "admin.settings");
}

const templateSchema = z.object({ id: uuid, title_template: z.string().trim().min(1).max(200), body_template: z.string().trim().min(1).max(2000), is_active: z.preprocess((v) => v === "on", z.boolean()) });

export async function updateTemplateAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { ws, admin, actor } = await adminContext();
    const p = templateSchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid template");
    const { id, ...rest } = p.data;
    const { error } = await admin.from("notification_templates").update({ ...rest, updated_by: ws.userId }).eq("id", id);
    if (error) return fail("Could not save template");
    await audit(actor, "template.updated", { type: "notification_template", id });
    revalidatePath("/admin/settings");
    return ok("Template saved");
  }, "admin.template");
}

const defaultCategorySchema = z.object({ kind: z.enum(["income", "expense"]), name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });

export async function addDefaultCategoryAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const { admin, actor } = await adminContext();
    const p = defaultCategorySchema.safeParse(formDataToObject(fd));
    if (!p.success) return fail("Invalid category");
    const { error } = await admin.from("default_categories").insert({ ...p.data, sort_order: 100 });
    if (error) return fail(error.code === "23505" ? "Category already exists" : "Could not add category");
    await audit(actor, "default_category.added", { type: "default_category", id: p.data.name }, p.data);
    revalidatePath("/admin/settings");
    return ok("Default category added for new users");
  }, "admin.defaultCategory");
}

export async function toggleDefaultCategoryAction(id: string, active: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const { admin, actor } = await adminContext();
    if (!uuid.safeParse(id).success) return fail("Invalid category");
    const { error } = await admin.from("default_categories").update({ is_active: !!active }).eq("id", id);
    if (error) return fail("Could not update category");
    await audit(actor, active ? "default_category.enabled" : "default_category.disabled", { type: "default_category", id });
    revalidatePath("/admin/settings");
    return ok(active ? "Enabled" : "Disabled");
  }, "admin.toggleDefaultCategory");
}
