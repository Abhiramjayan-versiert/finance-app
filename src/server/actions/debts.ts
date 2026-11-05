"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { debtPaymentSchema, debtSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { splitPayment } from "@/lib/finance/debt";
import { addDaysISO } from "@/lib/finance/dates";
import { fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { rollForwardDueDate } from "@/server/maintenance";
import * as L from "@/server/data/ledger";
import type { Debt } from "@/types/database";

function revalidateDebts() {
  for (const p of ["/debts", "/dashboard", "/net-worth"]) revalidatePath(p);
}

export async function saveDebtAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(debtSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const store = getStore();
    const row = { name: d.name, kind: d.kind, lender: d.lender, principal_minor: d.principal, interest_rate: d.interestRate, emi_minor: d.emi, payment_frequency: d.paymentFrequency, start_date: d.startDate, end_date: d.endDate, next_due_date: d.nextDueDate, notes: d.notes, updated_at: new Date().toISOString() };
    if (d.id) {
      const existing = await store.get<{ principal_paid_minor?: number }>(L.P.debt(ws.userId, d.id));
      if (!existing) return fail("Debt not found");
      // Outstanding is derived from payments; correct the opening value so today's outstanding matches.
      await store.update(L.P.debt(ws.userId, d.id), { ...row, opening_outstanding_minor: d.outstanding + (existing.principal_paid_minor ?? 0) });
    } else {
      await store.create(L.P.debt(ws.userId, store.newId()), { ...row, user_id: ws.userId, opening_outstanding_minor: d.outstanding, principal_paid_minor: 0, interest_paid_minor: 0, payment_count: 0, closed_at: d.outstanding === 0 ? new Date().toISOString() : null, created_at: new Date().toISOString(), deleted_at: null });
    }
    revalidateDebts();
    return ok(d.id ? "Debt updated" : "Debt added");
  }, "saveDebt");
}

export async function recordDebtPaymentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(debtPaymentSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const store = getStore();
    const debt = await store.get<Debt & { principal_paid_minor?: number }>(L.P.debt(ws.userId, d.debtId));
    if (!debt) return fail("Debt not found");
    const outstanding = debt.opening_outstanding_minor - (debt.principal_paid_minor ?? 0);
    let interest: number;
    let principal: number;
    if (d.autoSplit || d.interest == null) {
      const s = splitPayment(d.amount, outstanding, Number(debt.interest_rate), debt.payment_frequency);
      interest = s.interestMinor;
      principal = s.principalMinor;
    } else {
      interest = Math.min(d.interest, d.amount);
      principal = d.amount - interest;
    }
    const nextDue = debt.next_due_date && debt.next_due_date <= d.paidOn ? rollForwardDueDate(debt.next_due_date, debt.payment_frequency, addDaysISO(d.paidOn, 1)) : undefined;
    const r = await L.recordDebtPayment(store, ws.userId, { debtId: d.debtId, amount: d.amount, principal, interest, affectsCash: d.affectsCash, paidOn: d.paidOn, note: d.note, clientRef: d.clientRef, nextDueDate: nextDue });
    revalidateDebts();
    return ok(r.status === "duplicate" ? "Already saved" : r.paidOff ? "Payment recorded — this debt is fully repaid! 🎉" : "Payment recorded");
  }, "debtPayment");
}

export async function deleteDebtPaymentAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid payment");
    await L.deleteDebtPayment(getStore(), ws.userId, id);
    revalidateDebts();
    return ok("Payment removed");
  }, "deleteDebtPayment");
}

export async function deleteDebtAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid debt");
    await L.deleteDebt(getStore(), ws.userId, id);
    revalidateDebts();
    return ok("Debt deleted");
  }, "deleteDebt");
}
