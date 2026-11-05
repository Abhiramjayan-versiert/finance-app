"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { categorySchema, recurringUpdateSchema, transactionSchema } from "@/lib/validation/schemas";
import { dbErrorMessage, fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { uuid } from "@/lib/validation/common";
import { materializeRecurring } from "@/server/maintenance";
import { rateLimit } from "@/lib/security/rate-limit";

function revalidateMoney() {
  for (const p of ["/dashboard", "/transactions", "/income", "/expenses", "/budgets", "/reports", "/net-worth"]) revalidatePath(p);
}

export async function saveTransactionAction(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!(await rateLimit("tx-write", [ws.userId], 120, 60))) return fail("You're doing that too quickly. Please slow down.");
    const p = parseForm(transactionSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const categoryId = d.type === "expense" ? d.subcategoryId ?? d.categoryId : d.categoryId;
    if (d.receiptPath && !d.receiptPath.startsWith(`${ws.userId}/`)) return fail("Invalid receipt file.");

    const row = {
      type: d.type,
      status: d.type === "income" ? d.status : "completed",
      title: d.title,
      amount_minor: d.amount,
      currency: ws.settings.currency,
      income_category_id: d.type === "income" ? categoryId : null,
      expense_category_id: d.type === "expense" ? categoryId : null,
      occurred_on: d.occurredOn,
      payment_method: d.paymentMethod,
      merchant: d.type === "expense" ? d.merchant : null,
      source: d.type === "income" ? d.source : null,
      notes: d.notes,
      receipt_path: d.receiptPath,
    };

    if (d.id) {
      const { error } = await supabase.from("transactions").update(row).eq("id", d.id).eq("user_id", ws.userId).is("deleted_at", null);
      if (error) return fail(dbErrorMessage(error));
      revalidateMoney();
      return ok("Transaction updated", { id: d.id });
    }

    if (d.recurring && d.frequency) {
      // Create the rule; occurrences up to today are generated idempotently.
      const { data: rule, error } = await supabase
        .from("recurring_transactions")
        .insert({
          user_id: ws.userId,
          type: d.type,
          title: d.title,
          amount_minor: d.amount,
          currency: ws.settings.currency,
          income_category_id: row.income_category_id,
          expense_category_id: row.expense_category_id,
          payment_method: d.paymentMethod,
          merchant: row.merchant,
          source: row.source,
          notes: d.notes,
          frequency: d.frequency,
          interval_count: d.intervalCount,
          start_date: d.occurredOn,
          end_date: d.endDate,
        })
        .select("id")
        .single();
      if (error) return fail(dbErrorMessage(error));
      await materializeRecurring(supabase, ws.userId, ws.today);
      revalidateMoney();
      return ok(d.occurredOn > ws.today ? "Recurring transaction scheduled" : "Recurring transaction created", { id: rule.id });
    }

    const { data, error } = await supabase.from("transactions").insert({ ...row, user_id: ws.userId, client_ref: d.clientRef }).select("id").single();
    if (error) {
      // Same client reference => this submission was already saved (double click / offline replay).
      if (error.code === "23505" && d.clientRef) return ok("Already saved", { id: "" });
      return fail(dbErrorMessage(error));
    }
    revalidateMoney();
    return ok(d.type === "income" ? "Income added" : "Expense added", { id: data.id });
  }, "saveTransaction");
}

export async function deleteTransactionAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const parsed = uuid.safeParse(id);
    if (!parsed.success) return fail("Invalid transaction");
    const supabase = await createClient();
    const { data, error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.data).eq("user_id", ws.userId).is("deleted_at", null).select("id");
    if (error) return fail(dbErrorMessage(error));
    if (!data?.length) return fail("Transaction not found");
    revalidateMoney();
    return ok("Transaction deleted");
  }, "deleteTransaction");
}

export async function restoreTransactionAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const parsed = uuid.safeParse(id);
    if (!parsed.success) return fail("Invalid transaction");
    const supabase = await createClient();
    const { error } = await supabase.from("transactions").update({ deleted_at: null }).eq("id", parsed.data).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateMoney();
    return ok("Transaction restored");
  }, "restoreTransaction");
}

export async function updateRecurringAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(recurringUpdateSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const { error } = await supabase
      .from("recurring_transactions")
      .update({ title: d.title, amount_minor: d.amount, frequency: d.frequency, interval_count: d.intervalCount, end_date: d.endDate, is_active: d.isActive })
      .eq("id", d.id)
      .eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    if (d.isActive) await materializeRecurring(supabase, ws.userId, ws.today);
    revalidateMoney();
    return ok("Recurring rule updated. Future occurrences use the new values.");
  }, "updateRecurring");
}

export async function deleteRecurringAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const parsed = uuid.safeParse(id);
    if (!parsed.success) return fail("Invalid rule");
    const supabase = await createClient();
    const { error } = await supabase.from("recurring_transactions").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", parsed.data).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateMoney();
    return ok("Recurring rule stopped. Past transactions were kept.");
  }, "deleteRecurring");
}

export async function getReceiptUrlAction(path: string): Promise<ActionResult<{ url: string }>> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (typeof path !== "string" || !path.startsWith(`${ws.userId}/`) || path.includes("..")) return fail("Invalid file");
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 60);
    if (error || !data) return fail("Could not open the receipt");
    return ok(undefined, { url: data.signedUrl });
  }, "receiptUrl");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export async function saveCategoryAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(categorySchema, fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const table = d.kind === "income" ? "income_categories" : "expense_categories";
    const row: Record<string, unknown> = { name: d.name, color: d.color };
    if (d.kind === "expense") row.parent_id = d.parentId;
    const res = d.id
      ? await supabase.from(table).update(row).eq("id", d.id).eq("user_id", ws.userId)
      : await supabase.from(table).insert({ ...row, user_id: ws.userId });
    if (res.error) return fail(res.error.code === "23505" ? "A category with this name already exists." : dbErrorMessage(res.error));
    revalidatePath("/", "layout");
    return ok(d.id ? "Category updated" : "Category created");
  }, "saveCategory");
}

export async function archiveCategoryAction(kind: "income" | "expense", id: string, archived: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const parsed = uuid.safeParse(id);
    if (!parsed.success || (kind !== "income" && kind !== "expense")) return fail("Invalid category");
    const supabase = await createClient();
    const { error } = await supabase.from(kind === "income" ? "income_categories" : "expense_categories").update({ archived: !!archived }).eq("id", parsed.data).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidatePath("/", "layout");
    return ok(archived ? "Category archived" : "Category restored");
  }, "archiveCategory");
}
