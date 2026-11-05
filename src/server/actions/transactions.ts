"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { categorySchema, recurringUpdateSchema, transactionSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { rateLimit } from "@/lib/security/rate-limit";
import * as L from "@/server/data/ledger";

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
    const store = getStore();
    const categoryId = d.type === "expense" ? d.subcategoryId ?? d.categoryId : d.categoryId;
    if (d.receiptPath && !d.receiptPath.startsWith(`${ws.userId}/`)) return fail("Invalid receipt file.");
    const row = {
      type: d.type,
      status: d.type === "income" ? d.status : ("completed" as const),
      title: d.title,
      amount_minor: d.amount,
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
      await L.updateTransaction(store, ws.userId, d.id, row);
      revalidateMoney();
      return ok("Transaction updated", { id: d.id });
    }

    if (d.recurring && d.frequency) {
      const id = store.newId();
      await store.create(L.P.recurring(ws.userId, id), {
        user_id: ws.userId, type: d.type, title: d.title, amount_minor: d.amount, currency: ws.settings.currency,
        income_category_id: row.income_category_id, expense_category_id: row.expense_category_id, payment_method: d.paymentMethod,
        merchant: row.merchant, source: row.source, notes: d.notes, frequency: d.frequency, interval_count: d.intervalCount,
        start_date: d.occurredOn, end_date: d.endDate, last_generated_date: null, is_active: true, created_at: new Date().toISOString(), deleted_at: null,
      });
      await L.materializeRecurring(store, ws.userId, ws.today);
      revalidateMoney();
      return ok(d.occurredOn > ws.today ? "Recurring transaction scheduled" : "Recurring transaction created", { id });
    }

    const id = d.clientRef ?? store.newId();
    const res = await L.createTransaction(store, ws.userId, id, { ...row, currency: ws.settings.currency });
    revalidateMoney();
    return ok(res === "duplicate" ? "Already saved" : d.type === "income" ? "Income added" : "Expense added", { id });
  }, "saveTransaction");
}

export async function deleteTransactionAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid transaction");
    await L.setTransactionDeleted(getStore(), ws.userId, id, true);
    revalidateMoney();
    return ok("Transaction deleted");
  }, "deleteTransaction");
}

export async function restoreTransactionAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid transaction");
    await L.setTransactionDeleted(getStore(), ws.userId, id, false);
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
    const store = getStore();
    if (!(await store.get(L.P.recurring(ws.userId, d.id)))) return fail("Rule not found");
    await store.update(L.P.recurring(ws.userId, d.id), { title: d.title, amount_minor: d.amount, frequency: d.frequency, interval_count: d.intervalCount, end_date: d.endDate, is_active: d.isActive, updated_at: new Date().toISOString() });
    if (d.isActive) await L.materializeRecurring(store, ws.userId, ws.today);
    revalidateMoney();
    return ok("Recurring rule updated. Future occurrences use the new values.");
  }, "updateRecurring");
}

export async function deleteRecurringAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid rule");
    const store = getStore();
    if (!(await store.get(L.P.recurring(ws.userId, id)))) return fail("Rule not found");
    await store.update(L.P.recurring(ws.userId, id), { deleted_at: new Date().toISOString(), is_active: false });
    revalidateMoney();
    return ok("Recurring rule stopped. Past transactions were kept.");
  }, "deleteRecurring");
}

export async function getReceiptUrlAction(path: string): Promise<ActionResult<{ url: string }>> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (typeof path !== "string" || !path.startsWith(`${ws.userId}/`)) return fail("Invalid file");
    return ok(undefined, { url: `/api/files/${encodeURIComponent(path.split("/")[1])}` });
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
    const store = getStore();
    const colName = d.kind === "income" ? "income_categories" : "expense_categories";
    const existing = await store.list<{ name: string; parent_id?: string | null }>(userPath(ws.userId, colName));
    const parentId = d.kind === "expense" ? d.parentId : null;
    if (parentId) {
      const parent = existing.find((c) => c.id === parentId);
      if (!parent) return fail("Parent category not found");
      if (parent.parent_id) return fail("Subcategories cannot be nested more than one level");
      if (parentId === d.id) return fail("A category cannot be its own parent");
    }
    if (existing.some((c) => c.id !== d.id && c.name.toLowerCase() === d.name.toLowerCase() && (c.parent_id ?? null) === parentId)) return fail("A category with this name already exists.");
    const row = { name: d.name, color: d.color, parent_id: parentId };
    if (d.id) {
      if (!existing.some((c) => c.id === d.id)) return fail("Category not found");
      await store.update(userPath(ws.userId, colName, d.id), row);
    } else await store.create(userPath(ws.userId, colName, store.newId()), { ...row, user_id: ws.userId, icon: "circle", is_default: false, archived: false, created_at: new Date().toISOString() });
    revalidatePath("/", "layout");
    return ok(d.id ? "Category updated" : "Category created");
  }, "saveCategory");
}

export async function archiveCategoryAction(kind: "income" | "expense", id: string, archived: boolean): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success || (kind !== "income" && kind !== "expense")) return fail("Invalid category");
    const path = userPath(ws.userId, kind === "income" ? "income_categories" : "expense_categories", id);
    const store = getStore();
    if (!(await store.get(path))) return fail("Category not found");
    await store.update(path, { archived: !!archived });
    revalidatePath("/", "layout");
    return ok(archived ? "Category archived" : "Category restored");
  }, "archiveCategory");
}

