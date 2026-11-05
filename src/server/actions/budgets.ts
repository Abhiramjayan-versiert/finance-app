"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { budgetSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";

export async function saveBudgetAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(budgetSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const store = getStore();
    if (d.endDate && d.endDate < d.startDate) return fail("End date must be after the start date", { endDate: "Must be after the start date" });
    if (d.categoryId && !(await store.get(userPath(ws.userId, "expense_categories", d.categoryId)))) return fail("Category not found");
    // One active budget per (period, category).
    const existing = (await store.list<{ period: string; expense_category_id: string | null; deleted_at?: string | null }>(userPath(ws.userId, "budgets"))).filter((b) => !b.deleted_at);
    if (existing.some((b) => b.id !== d.id && b.period === d.period && (b.expense_category_id ?? null) === (d.categoryId ?? null))) return fail("You already have a budget for this category and period. Edit it instead.");
    const row = { name: d.name, period: d.period, expense_category_id: d.categoryId, amount_minor: d.amount, thresholds: d.thresholds, start_date: d.startDate, end_date: d.endDate, updated_at: new Date().toISOString() };
    if (d.id) {
      if (!existing.some((b) => b.id === d.id)) return fail("Budget not found");
      await store.update(userPath(ws.userId, "budgets", d.id), row);
    } else await store.create(userPath(ws.userId, "budgets", store.newId()), { ...row, user_id: ws.userId, created_at: new Date().toISOString(), deleted_at: null });
    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    return ok(d.id ? "Budget updated" : "Budget created");
  }, "saveBudget");
}

export async function deleteBudgetAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid budget");
    const store = getStore();
    const path = userPath(ws.userId, "budgets", id);
    if (!(await store.get(path))) return fail("Budget not found");
    await store.update(path, { deleted_at: new Date().toISOString() });
    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    return ok("Budget deleted");
  }, "deleteBudget");
}
