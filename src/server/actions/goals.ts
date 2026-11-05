"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { goalContributionSchema, goalSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { dbErrorMessage, fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";

function revalidateGoals(id?: string) {
  for (const p of ["/goals", "/dashboard", "/savings", "/net-worth"]) revalidatePath(p);
  if (id) revalidatePath(`/goals/${id}`);
}

export async function saveGoalAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(goalSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    if (d.imagePath && !d.imagePath.startsWith(`${ws.userId}/`)) return fail("Invalid image");
    const supabase = await createClient();
    if (d.id) {
      const patch: Record<string, unknown> = {
        name: d.name,
        category: d.category,
        product_category: d.productCategory,
        description: d.description,
        target_amount_minor: d.targetAmount,
        target_date: d.targetDate,
        priority: d.priority,
        product_url: d.productUrl ?? null,
        savings_account_id: d.savingsAccountId,
      };
      if (d.imagePath !== undefined) patch.image_path = d.imagePath;
      if (d.status) {
        patch.status = d.status;
        patch.completed_at = d.status === "completed" ? new Date().toISOString() : null;
      }
      const { error } = await supabase.from("financial_goals").update(patch).eq("id", d.id).eq("user_id", ws.userId);
      if (error) return fail(error.code === "23505" ? "That savings account already backs another goal." : dbErrorMessage(error));
      revalidateGoals(d.id);
      return ok("Goal updated — plan recalculated", { id: d.id });
    }
    const { data, error } = await supabase.rpc("create_financial_goal", {
      p_name: d.name,
      p_category: d.category,
      p_target_amount_minor: d.targetAmount,
      p_target_date: d.targetDate,
      p_priority: d.priority,
      p_description: d.description,
      p_product_category: d.productCategory,
      p_product_url: d.productUrl ?? null,
      p_image_path: d.imagePath,
      p_savings_account_id: d.savingsAccountId,
      p_initial_saved_minor: d.savingsAccountId ? 0 : d.currentSavings ?? 0,
      p_initial_affects_cash: d.currentSavingsFromCash,
    });
    if (error) return fail(error.code === "23505" ? "That savings account already backs another goal." : dbErrorMessage(error));
    revalidateGoals();
    return ok("Goal created", { id: data as string });
  }, "saveGoal");
}

export async function contributeToGoalAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(goalContributionSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const { error } = await supabase.from("goal_contributions").insert({
      user_id: ws.userId,
      goal_id: d.goalId,
      amount_minor: d.direction === "add" ? d.amount : -d.amount,
      affects_cash: d.affectsCash,
      occurred_on: d.occurredOn,
      note: d.note,
      client_ref: d.clientRef,
    });
    if (error) {
      if (error.code === "23505" && d.clientRef) return ok("Already saved");
      return fail(dbErrorMessage(error));
    }
    // Keep stored status in sync for completion.
    const { data: prog } = await supabase.from("goal_progress").select("saved_minor").eq("goal_id", d.goalId).single();
    const { data: goal } = await supabase.from("financial_goals").select("target_amount_minor, status").eq("id", d.goalId).single();
    if (goal && prog) {
      const done = Number(prog.saved_minor) >= goal.target_amount_minor;
      if (done && goal.status !== "completed") await supabase.from("financial_goals").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", d.goalId);
      else if (!done && (goal.status === "completed" || goal.status === "not_started")) await supabase.from("financial_goals").update({ status: "active", completed_at: null }).eq("id", d.goalId);
    }
    revalidateGoals(d.goalId);
    return ok(d.direction === "add" ? "Contribution added" : "Amount released from goal");
  }, "contributeGoal");
}

export async function deleteContributionAction(id: string, goalId: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid entry");
    const supabase = await createClient();
    const { error } = await supabase.from("goal_contributions").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateGoals(goalId);
    return ok("Entry removed");
  }, "deleteContribution");
}

export async function setGoalStatusAction(id: string, status: "active" | "paused" | "cancelled"): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success || !["active", "paused", "cancelled"].includes(status)) return fail("Invalid request");
    const supabase = await createClient();
    const { error } = await supabase.from("financial_goals").update({ status }).eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateGoals(id);
    return ok(status === "paused" ? "Goal paused" : status === "cancelled" ? "Goal cancelled" : "Goal resumed");
  }, "goalStatus");
}

export async function deleteGoalAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid goal");
    const supabase = await createClient();
    // Hard delete cascades its allocations; money allocated from cash returns to the cash balance.
    const { error } = await supabase.from("financial_goals").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateGoals();
    return ok("Goal deleted");
  }, "deleteGoal");
}

export async function getGoalImageUrlAction(path: string): Promise<ActionResult<{ url: string }>> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!path.startsWith(`${ws.userId}/`) || path.includes("..")) return fail("Invalid file");
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from("goal-images").createSignedUrl(path, 3600);
    if (error || !data) return fail("Image unavailable");
    return ok(undefined, { url: data.signedUrl });
  }, "goalImage");
}
