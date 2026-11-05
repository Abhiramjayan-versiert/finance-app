"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { goalContributionSchema, goalSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import * as L from "@/server/data/ledger";

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
    const store = getStore();
    const data = {
      name: d.name, category: d.category, product_category: d.productCategory, description: d.description,
      target_amount_minor: d.targetAmount, target_date: d.targetDate, priority: d.priority, product_url: d.productUrl ?? null,
      savings_account_id: d.savingsAccountId,
    };
    if (d.id) {
      const patch: Record<string, unknown> & { savings_account_id: string | null } = { ...data };
      if (d.imagePath !== undefined) patch.image_path = d.imagePath;
      if (d.status) {
        patch.status = d.status;
        patch.completed_at = d.status === "completed" ? new Date().toISOString() : null;
      }
      await L.updateGoal(store, ws.userId, d.id, patch);
      revalidateGoals(d.id);
      return ok("Goal updated — plan recalculated", { id: d.id });
    }
    const id = await L.createGoal(store, ws.userId, { ...data, image_path: d.imagePath ?? null }, d.savingsAccountId ? 0 : d.currentSavings ?? 0, d.currentSavingsFromCash);
    revalidateGoals();
    return ok("Goal created", { id });
  }, "saveGoal");
}

export async function contributeToGoalAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(goalContributionSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const r = await L.contributeToGoal(getStore(), ws.userId, { goalId: d.goalId, amount: d.direction === "add" ? d.amount : -d.amount, affectsCash: d.affectsCash, occurredOn: d.occurredOn, note: d.note, clientRef: d.clientRef });
    revalidateGoals(d.goalId);
    return ok(r === "duplicate" ? "Already saved" : d.direction === "add" ? "Contribution added" : "Amount released from goal");
  }, "contributeGoal");
}

export async function deleteContributionAction(id: string, goalId: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid entry");
    await L.deleteContribution(getStore(), ws.userId, id);
    revalidateGoals(goalId);
    return ok("Entry removed");
  }, "deleteContribution");
}

export async function setGoalStatusAction(id: string, status: "active" | "paused" | "cancelled"): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success || !["active", "paused", "cancelled"].includes(status)) return fail("Invalid request");
    const store = getStore();
    if (!(await store.get(L.P.goal(ws.userId, id)))) return fail("Goal not found");
    await store.update(L.P.goal(ws.userId, id), { status, updated_at: new Date().toISOString() });
    revalidateGoals(id);
    return ok(status === "paused" ? "Goal paused" : status === "cancelled" ? "Goal cancelled" : "Goal resumed");
  }, "goalStatus");
}

export async function deleteGoalAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid goal");
    await L.deleteGoal(getStore(), ws.userId, id);
    revalidateGoals();
    return ok("Goal deleted");
  }, "deleteGoal");
}
