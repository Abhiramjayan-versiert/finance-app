"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { debtPaymentSchema, debtSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { splitPayment } from "@/lib/finance/debt";
import { dbErrorMessage, fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";

function revalidateDebts() {
  for (const p of ["/debts", "/dashboard", "/net-worth"]) revalidatePath(p);
}

export async function saveDebtAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(debtSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const row = {
      name: d.name,
      kind: d.kind,
      lender: d.lender,
      principal_minor: d.principal,
      interest_rate: d.interestRate,
      emi_minor: d.emi,
      payment_frequency: d.paymentFrequency,
      start_date: d.startDate,
      end_date: d.endDate,
      next_due_date: d.nextDueDate,
      notes: d.notes,
    };
    if (d.id) {
      // Outstanding is derived from payments; the opening value can be corrected.
      const { data: bal } = await supabase.from("debt_balances").select("principal_paid_minor").eq("debt_id", d.id).single();
      const paid = Number(bal?.principal_paid_minor ?? 0);
      const { error } = await supabase.from("debts").update({ ...row, opening_outstanding_minor: d.outstanding + paid }).eq("id", d.id).eq("user_id", ws.userId);
      if (error) return fail(dbErrorMessage(error));
      revalidateDebts();
      return ok("Debt updated");
    }
    const { error } = await supabase.from("debts").insert({ ...row, opening_outstanding_minor: d.outstanding, user_id: ws.userId });
    if (error) return fail(dbErrorMessage(error));
    revalidateDebts();
    return ok("Debt added");
  }, "saveDebt");
}

export async function recordDebtPaymentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(debtPaymentSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const [{ data: debt }, { data: bal }] = await Promise.all([
      supabase.from("debts").select("*").eq("id", d.debtId).eq("user_id", ws.userId).single(),
      supabase.from("debt_balances").select("outstanding_minor").eq("debt_id", d.debtId).single(),
    ]);
    if (!debt) return fail("Debt not found");
    const outstanding = Number(bal?.outstanding_minor ?? debt.opening_outstanding_minor);
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
    if (principal > outstanding) return fail(`Principal repaid cannot exceed the outstanding amount. Reduce the payment or increase the interest portion.`);
    const { error } = await supabase.from("debt_payments").insert({ user_id: ws.userId, debt_id: d.debtId, amount_minor: d.amount, principal_minor: principal, interest_minor: interest, affects_cash: d.affectsCash, paid_on: d.paidOn, note: d.note, client_ref: d.clientRef });
    if (error) {
      if (error.code === "23505" && d.clientRef) return ok("Already saved");
      return fail(dbErrorMessage(error));
    }
    // Advance the next due date to the first one after this payment.
    if (debt.next_due_date && debt.next_due_date <= d.paidOn) {
      const { rollForwardDueDate } = await import("@/server/maintenance");
      const { addDaysISO } = await import("@/lib/finance/dates");
      const next = rollForwardDueDate(debt.next_due_date, debt.payment_frequency, addDaysISO(d.paidOn, 1));
      await supabase.from("debts").update({ next_due_date: next }).eq("id", d.debtId).eq("user_id", ws.userId);
    }
    if (principal === outstanding) await supabase.from("debts").update({ closed_at: new Date().toISOString() }).eq("id", d.debtId).eq("user_id", ws.userId);
    revalidateDebts();
    return ok(principal === outstanding ? "Payment recorded — this debt is fully repaid! 🎉" : "Payment recorded");
  }, "debtPayment");
}

export async function deleteDebtPaymentAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid payment");
    const supabase = await createClient();
    const { data } = await supabase.from("debt_payments").select("debt_id").eq("id", id).single();
    const { error } = await supabase.from("debt_payments").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    if (data) await supabase.from("debts").update({ closed_at: null }).eq("id", data.debt_id).eq("user_id", ws.userId);
    revalidateDebts();
    return ok("Payment removed");
  }, "deleteDebtPayment");
}

export async function deleteDebtAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid debt");
    const supabase = await createClient();
    const { error } = await supabase.from("debts").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateDebts();
    return ok("Debt deleted");
  }, "deleteDebt");
}
