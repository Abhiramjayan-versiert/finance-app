"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { savingsAccountSchema, savingsMovementSchema, savingsTransferSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { dbErrorMessage, fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";

function revalidateSavings() {
  for (const p of ["/savings", "/dashboard", "/goals", "/net-worth"]) revalidatePath(p);
}

export async function saveSavingsAccountAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(savingsAccountSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const row = { name: d.name, kind: d.kind, target_amount_minor: d.targetAmount, monthly_target_minor: d.monthlyTarget, color: d.color };
    if (d.id) {
      const { error } = await supabase.from("savings_accounts").update(row).eq("id", d.id).eq("user_id", ws.userId);
      if (error) return fail(dbErrorMessage(error));
      revalidateSavings();
      return ok("Savings account updated");
    }
    const { data, error } = await supabase.from("savings_accounts").insert({ ...row, user_id: ws.userId }).select("id").single();
    if (error) return fail(dbErrorMessage(error));
    if (d.openingBalance && d.openingBalance > 0) {
      // Pre-existing savings: an external opening balance, not taken from tracked cash.
      const ins = await supabase.from("savings_transactions").insert({ user_id: ws.userId, account_id: data.id, type: "deposit", amount_minor: d.openingBalance, affects_cash: false, occurred_on: ws.today, note: "Opening balance" });
      if (ins.error) return fail(dbErrorMessage(ins.error));
    }
    revalidateSavings();
    return ok("Savings account created");
  }, "saveSavingsAccount");
}

export async function savingsMovementAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(savingsMovementSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const { error } = await supabase.from("savings_transactions").insert({ user_id: ws.userId, account_id: d.accountId, type: d.type, amount_minor: d.amount, affects_cash: d.affectsCash, occurred_on: d.occurredOn, note: d.note, client_ref: d.clientRef });
    if (error) {
      if (error.code === "23505" && d.clientRef) return ok("Already saved");
      return fail(dbErrorMessage(error));
    }
    revalidateSavings();
    return ok(d.type === "deposit" ? "Savings added" : "Withdrawal recorded");
  }, "savingsMovement");
}

export async function savingsTransferAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(savingsTransferSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    // Atomic: both legs are written in one database transaction.
    const { error } = await supabase.rpc("transfer_savings", { p_from_account: d.fromAccountId, p_to_account: d.toAccountId, p_amount_minor: d.amount, p_occurred_on: d.occurredOn, p_note: d.note });
    if (error) return fail(dbErrorMessage(error));
    revalidateSavings();
    return ok("Transfer complete");
  }, "savingsTransfer");
}

export async function deleteSavingsTransactionAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid entry");
    const supabase = await createClient();
    const { error } = await supabase.from("savings_transactions").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateSavings();
    return ok("Entry removed");
  }, "deleteSavingsTx");
}

export async function deleteSavingsAccountAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid account");
    const supabase = await createClient();
    const { data: bal } = await supabase.from("savings_account_balances").select("balance_minor").eq("account_id", id).single();
    if (bal && Number(bal.balance_minor) !== 0) return fail("Withdraw or transfer the remaining balance before deleting this account.");
    const { error } = await supabase.from("savings_accounts").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateSavings();
    return ok("Savings account deleted");
  }, "deleteSavingsAccount");
}
