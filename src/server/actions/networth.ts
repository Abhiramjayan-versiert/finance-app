"use server";

import { revalidatePath } from "next/cache";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { userPath } from "@/lib/firebase/store";
import { assetSchema, liabilitySchema } from "@/lib/validation/schemas";
import { uuid } from "@/lib/validation/common";
import { fail, guarded, ok, parseForm, type ActionResult } from "@/lib/security/actions";
import { getNetWorth } from "@/server/queries/finance";
import { upsertSnapshot } from "@/server/maintenance";

function reval() {
  revalidatePath("/net-worth");
  revalidatePath("/dashboard");
}

async function save(uid: string, col: "assets" | "liabilities", id: string | null, row: Record<string, unknown>) {
  const store = getStore();
  const now = new Date().toISOString();
  if (id) {
    if (!(await store.get(userPath(uid, col, id)))) throw new Error("not found");
    await store.update(userPath(uid, col, id), { ...row, updated_at: now });
  } else await store.create(userPath(uid, col, store.newId()), { ...row, user_id: uid, created_at: now, updated_at: now, deleted_at: null });
}

export async function saveAssetAction(_: unknown, fd: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    const p = parseForm(assetSchema(ws.settings.currency), fd);
    if (!p.ok) return p.result;
    const d = p.data;
    await save(ws.userId, "assets", d.id, { name: d.name, type: d.type, value_minor: d.value, as_of: d.asOf, notes: d.notes });
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
    await save(ws.userId, "liabilities", d.id, { name: d.name, type: d.type, amount_minor: d.amount, as_of: d.asOf, notes: d.notes });
    reval();
    return ok(d.id ? "Liability updated" : "Liability added");
  }, "saveLiability");
}

export async function deleteBalanceItemAction(kind: "asset" | "liability", id: string): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!uuid.safeParse(id).success || (kind !== "asset" && kind !== "liability")) return fail("Invalid item");
    const path = userPath(ws.userId, kind === "asset" ? "assets" : "liabilities", id);
    const store = getStore();
    if (!(await store.get(path))) return fail("Item not found");
    await store.update(path, { deleted_at: new Date().toISOString() });
    reval();
    return ok("Removed");
  }, "deleteBalanceItem");
}

export async function saveSnapshotAction(): Promise<ActionResult> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    await upsertSnapshot(getStore(), ws.userId, ws.today, await getNetWorth(ws.today, ws.settings.net_worth_cash_source));
    reval();
    return ok("Snapshot saved for this month");
  }, "saveSnapshot");
}
