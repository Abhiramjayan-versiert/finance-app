"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionWorkspace } from "@/lib/auth";
import { getStore } from "@/lib/firebase/admin";
import { isoDate } from "@/lib/validation/common";
import { fail, guarded, ok, type ActionResult } from "@/lib/security/actions";
import { rateLimit } from "@/lib/security/rate-limit";
import { LedgerError } from "@/lib/firebase/store";
import * as L from "@/server/data/ledger";

const rowSchema = z.object({
  date: isoDate,
  title: z.string().trim().min(1).max(120),
  type: z.enum(["income", "expense"]),
  amountMinor: z.number().int().positive().max(1e15),
  dupIndex: z.number().int().min(0).max(1000),
});

const payloadSchema = z.object({
  rows: z.array(rowSchema).min(1).max(200),
  expenseCategoryId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).nullable(),
  incomeCategoryId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).nullable(),
  paymentMethod: z.enum(["cash", "upi", "debit_card", "credit_card", "bank_transfer", "other"]),
});

export type ImportPayload = z.input<typeof payloadSchema>;

/**
 * Imports up to 200 statement rows per call. Each row gets a deterministic id
 * derived from its content, so importing the same statement twice (or an
 * overlapping one) never creates duplicates.
 */
export async function importTransactionsAction(payload: ImportPayload): Promise<ActionResult<{ created: number; duplicates: number; failed: number }>> {
  return guarded(async () => {
    const ws = await actionWorkspace();
    if (!(await rateLimit("import", [ws.userId], 60, 600))) return fail("Too many imports. Please wait a few minutes.");
    const p = payloadSchema.safeParse(payload);
    if (!p.success) return fail("The file contains rows we couldn't read. Check the column mapping.");
    const store = getStore();
    let created = 0, duplicates = 0, failed = 0;
    for (const r of p.data.rows) {
      const id = "imp_" + createHash("sha256").update([ws.userId, r.date, r.type, r.amountMinor, r.title.toLowerCase(), r.dupIndex].join("|")).digest("hex").slice(0, 32);
      try {
        const res = await L.createTransaction(store, ws.userId, id, {
          type: r.type,
          status: "completed",
          title: r.title,
          amount_minor: r.amountMinor,
          currency: ws.settings.currency,
          income_category_id: r.type === "income" ? p.data.incomeCategoryId : null,
          expense_category_id: r.type === "expense" ? p.data.expenseCategoryId : null,
          occurred_on: r.date,
          payment_method: p.data.paymentMethod,
          merchant: null,
          source: null,
          notes: "Imported from bank statement",
          receipt_path: null,
        });
        if (res === "created") created++;
        else duplicates++;
      } catch (e) {
        if (e instanceof LedgerError) failed++;
        else throw e;
      }
    }
    for (const path of ["/dashboard", "/transactions", "/income", "/expenses", "/budgets", "/reports"]) revalidatePath(path);
    return ok(undefined, { created, duplicates, failed });
  }, "importTransactions");
}
