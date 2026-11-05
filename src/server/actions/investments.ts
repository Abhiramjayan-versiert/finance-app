"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { investmentSchema, investmentTxSchema, investmentUpdateSchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { dbErrorMessage, fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";

function revalidateInv() {
  for (const p of ["/investments", "/dashboard", "/net-worth"]) revalidatePath(p);
}

export async function createInvestmentAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(investmentSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_investment", {
      p_name: d.name,
      p_asset_type: d.assetType,
      p_amount_invested_minor: d.amountInvested,
      p_purchase_date: d.purchaseDate,
      p_units: d.units,
      p_price_per_unit_minor: d.purchasePrice,
      p_current_value_minor: d.currentValue,
      p_symbol: d.symbol,
      p_notes: d.notes,
      p_affects_cash: d.fromCash,
      p_sip_monthly_minor: d.sipMonthly,
      p_sip_start_date: d.sipStartDate,
      p_sip_duration_months: d.sipDurationMonths,
      p_expected_return_pct: d.expectedReturnPct,
    });
    if (error) return fail(dbErrorMessage(error));
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
    const supabase = await createClient();
    const { error } = await supabase
      .from("investments")
      .update({ name: d.name, symbol: d.symbol, notes: d.notes, sip_monthly_minor: d.sipMonthly, sip_start_date: d.sipStartDate, sip_duration_months: d.sipDurationMonths, expected_return_pct: d.expectedReturnPct })
      .eq("id", d.id)
      .eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
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
    const supabase = await createClient();
    const { error } = await supabase.from("investment_transactions").insert({
      user_id: ws.userId,
      investment_id: d.investmentId,
      type: d.type,
      amount_minor: d.amount,
      units: d.type === "valuation" ? null : d.units,
      affects_cash: d.type === "valuation" ? false : d.affectsCash,
      occurred_on: d.occurredOn,
      note: d.note,
      client_ref: d.clientRef,
    });
    if (error) {
      if (error.code === "23505" && d.clientRef) return ok("Already saved");
      return fail(dbErrorMessage(error));
    }
    revalidateInv();
    return ok(d.type === "valuation" ? "Current value updated" : d.type === "buy" ? "Purchase recorded" : "Sale recorded");
  }, "investmentTx");
}

export async function deleteInvestmentAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid investment");
    const supabase = await createClient();
    const { error } = await supabase.from("investments").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    revalidateInv();
    return ok("Investment deleted");
  }, "deleteInvestment");
}

export async function deleteInvestmentTxAction(id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success) return fail("Invalid entry");
    const supabase = await createClient();
    const { data: tx } = await supabase.from("investment_transactions").select("investment_id, type").eq("id", id).single();
    const { error } = await supabase.from("investment_transactions").delete().eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    if (tx) {
      // Recompute the current value from the remaining history.
      const { data: rest } = await supabase.from("investment_transactions").select("type, amount_minor, occurred_on, created_at").eq("investment_id", tx.investment_id).order("occurred_on").order("created_at");
      let value = 0;
      for (const r of rest ?? []) value = r.type === "valuation" ? r.amount_minor : r.type === "buy" ? value + r.amount_minor : Math.max(0, value - r.amount_minor);
      await supabase.from("investments").update({ current_value_minor: value }).eq("id", tx.investment_id).eq("user_id", ws.userId);
    }
    revalidateInv();
    return ok("Entry removed");
  }, "deleteInvestmentTx");
}
