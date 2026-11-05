"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assetSchema, liabilitySchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { dbErrorMessage, fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { getNetWorth } from "@/server/queries/finance";
import { upsertSnapshot } from "@/server/maintenance";

function reval() {
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}

export async function saveAssetAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(assetSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const row = { name: d.name, type: d.type, value_minor: d.value, as_of: d.asOf, notes: d.notes };
    const res = d.id ? await supabase.from("assets").update(row).eq("id", d.id).eq("user_id", ws.userId) : await supabase.from("assets").insert({ ...row, user_id: ws.userId });
    if (res.error) return fail(dbErrorMessage(res.error));
    reval();
    return ok(d.id ? "Asset updated" : "Asset added");
  }, "saveAsset");
}

export async function saveLiabilityAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(liabilitySchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    const supabase = await createClient();
    const row = { name: d.name, type: d.type, amount_minor: d.amount, as_of: d.asOf, notes: d.notes };
    const res = d.id ? await supabase.from("liabilities").update(row).eq("id", d.id).eq("user_id", ws.userId) : await supabase.from("liabilities").insert({ ...row, user_id: ws.userId });
    if (res.error) return fail(dbErrorMessage(res.error));
    reval();
    return ok(d.id ? "Liability updated" : "Liability added");
  }, "saveLiability");
}

export async function deleteBalanceItemAction(kind: "asset" | "liability", id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success || (kind !== "asset" && kind !== "liability")) return fail("Invalid item");
    const supabase = await createClient();
    const { error } = await supabase.from(kind === "asset" ? "assets" : "liabilities").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("user_id", ws.userId);
    if (error) return fail(dbErrorMessage(error));
    reval();
    return ok("Removed");
  }, "deleteBalanceItem");
}

export async function saveSnapshotAction(): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const supabase = await createClient();
    const nw = await getNetWorth(ws.today, ws.settings.net_worth_cash_source);
    await upsertSnapshot(supabase, ws.userId, ws.today, nw);
    reval();
    return ok("Snapshot saved for this month");
  }, "saveSnapshot");
}
