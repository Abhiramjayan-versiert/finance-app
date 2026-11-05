"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { budgetSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { dbErrorMessage, fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";

export async function saveBudgetAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(budgetSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const row = { name: d.name, period: d.period, expense_category_id: d.categoryId, amount_minor: d.amount, thresholds: d.thresholds, start_date: d.startDate, end_date: d.endDate };
    const res = d.id ? await supabase.from("budgets").update(row).eq("id", d.id).eq("user_id", ws.userId) : await supabase.from("budgets").insert({ ...row, user_id: ws.userId });
    if (res.error) return fail(res.error.code === "23505" ? "You already have a budget for this category and period. Edit it instead." : dbErrorMessage(res.error));
    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    return ok(d.id ? "Budget updated" : "Budget created");
  }, "saveBudget");
}

export async function deleteBudgetAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const parsed = uuid.safeParse(id);
    if (!parsed.success) return fail("Invalid budget");
    const supabase = await createClient();
    const { error } = await supabase.from("budgets").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/budgets");
    revalidatePath("/dashboard");
    return ok("Budget deleted");
  }, "deleteBudget");
}
