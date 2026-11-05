"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { savingsAccountSchema, savingsMovementSchema, savingsTransferSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import * as L from "@/server/data/ledger";

function revalidateSavings() {
  for (const p of ["/savings", "/dashboard", "/goals", "/net-worth"]) revalidatePath(p);
}

export async function saveSavingsAccountAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(savingsAccountSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const store = getStore();
    const row = { name: d.name, kind: d.kind, target_amount_minor: d.targetAmount, monthly_target_minor: d.monthlyTarget, color: d.color };
    if (d.id) {
      if (!(await store.get(L.P.savingsAccount(ws.userId, d.id)))) return fail("Account not found");
      await store.update(L.P.savingsAccount(ws.userId, d.id), { ...row, updated_at: new Date().toISOString() });
      revalidateSavings();
      return ok("Savings account updated");
    }
    await L.createSavingsAccount(store, ws.userId, row, d.openingBalance ?? 0);
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
    const r = await L.savingsMovement(getStore(), ws.userId, { accountId: d.accountId, type: d.type, amount: d.amount, affectsCash: d.affectsCash, occurredOn: d.occurredOn, note: d.note, clientRef: d.clientRef });
    revalidateSavings();
    return ok(r === "duplicate" ? "Already saved" : d.type === "deposit" ? "Savings added" : "Withdrawal recorded");
  }, "savingsMovement");
}

export async function savingsTransferAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(savingsTransferSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    await L.transferSavings(getStore(), ws.userId, d.fromAccountId, d.toAccountId, d.amount, d.occurredOn, d.note);
    revalidateSavings();
    return ok("Transfer complete");
  }, "savingsTransfer");
}

export async function deleteSavingsTransactionAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid entry");
    await L.deleteSavingsEntry(getStore(), ws.userId, id);
    revalidateSavings();
    return ok("Entry removed");
  }, "deleteSavingsTx");
}

export async function deleteSavingsAccountAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid account");
    await L.deleteSavingsAccount(getStore(), ws.userId, id);
    revalidateSavings();
    return ok("Savings account deleted");
  }, "deleteSavingsAccount");
}
