"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { investmentSchema, investmentTxSchema, investmentUpdateSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import * as L from "@/server/data/ledger";

function revalidateInv() {
  for (const p of ["/investments", "/dashboard", "/net-worth"]) revalidatePath(p);
}

export async function createInvestmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(investmentSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    await L.createInvestment(
      getStore(),
      ws.userId,
      { name: d.name, asset_type: d.assetType, symbol: d.symbol, purchase_date: d.purchaseDate, notes: d.notes, sip_monthly_minor: d.sipMonthly, sip_start_date: d.sipStartDate, sip_duration_months: d.sipDurationMonths, expected_return_pct: d.expectedReturnPct, market_data_ref: null },
      { amount: d.amountInvested, units: d.units, pricePerUnit: d.purchasePrice, fromCash: d.fromCash },
      d.currentValue,
    );
    revalidateInv();
    return ok("Investment added");
  }, "createInvestment");
}

export async function updateInvestmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(investmentUpdateSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const store = getStore();
    if (!(await store.get(L.P.investment(ws.userId, d.id)))) return fail("Investment not found");
    await store.update(L.P.investment(ws.userId, d.id), { name: d.name, symbol: d.symbol, notes: d.notes, sip_monthly_minor: d.sipMonthly, sip_start_date: d.sipStartDate, sip_duration_months: d.sipDurationMonths, expected_return_pct: d.expectedReturnPct, updated_at: new Date().toISOString() });
    revalidateInv();
    return ok("Investment updated");
  }, "updateInvestment");
}

export async function addInvestmentTxAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(investmentTxSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const r = await L.addInvestmentTx(getStore(), ws.userId, { investmentId: d.investmentId, type: d.type, amount: d.amount, units: d.units, affectsCash: d.affectsCash, occurredOn: d.occurredOn, note: d.note, clientRef: d.clientRef });
    revalidateInv();
    return ok(r === "duplicate" ? "Already saved" : d.type === "valuation" ? "Current value updated" : d.type === "buy" ? "Purchase recorded" : "Sale recorded");
  }, "investmentTx");
}

export async function deleteInvestmentAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid investment");
    await L.deleteInvestment(getStore(), ws.userId, id);
    revalidateInv();
    return ok("Investment deleted");
  }, "deleteInvestment");
}

export async function deleteInvestmentTxAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid entry");
    await L.deleteInvestmentTx(getStore(), ws.userId, id);
    revalidateInv();
    return ok("Entry removed");
  }, "deleteInvestmentTx");
}
