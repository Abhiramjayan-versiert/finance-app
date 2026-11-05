import { z } from "zod";
import { MoneyError, toMinor } from "@/lib/finance/money";

export const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Enter a valid date")
  .refine((s) => s >= "1900-01-01" && s <= "2200-12-31", "Date is out of range");

export const optionalIsoDate = z.preprocess((v) => (v === "" || v == null ? null : v), isoDate.nullable());

/** Document identifiers (Firestore auto-ids, UUIDs, composite keys). Name kept for compatibility. */
export const uuid = z.string().trim().regex(/^[A-Za-z0-9_-]{1,80}$/, "Invalid identifier");
export const optionalUuid = z.preprocess((v) => (v === "" || v == null || v === "none" ? null : v), uuid.nullable());

export const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v ?? null), z.string().max(max, `Maximum ${max} characters`).nullable());

export const requiredText = (max: number, label = "This field") =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `Maximum ${max} characters`);

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());

/** Amount in major units (string from a form) → integer minor units. */
export function money(currency: string, opts: { allowZero?: boolean; allowNegative?: boolean; label?: string } = {}) {
  const label = opts.label ?? "Amount";
  return z
    .union([z.string(), z.number()], { error: `${label} is required` })
    .transform((v, ctx) => {
      try {
        const minor = toMinor(v, currency);
        if (!opts.allowNegative && minor < 0) {
          ctx.addIssue({ code: "custom", message: `${label} cannot be negative` });
          return z.NEVER;
        }
        if (!opts.allowZero && minor === 0) {
          ctx.addIssue({ code: "custom", message: `${label} must be greater than zero` });
          return z.NEVER;
        }
        return minor;
      } catch (e) {
        ctx.addIssue({ code: "custom", message: e instanceof MoneyError ? e.message : `Enter a valid ${label.toLowerCase()}` });
        return z.NEVER;
      }
    });
}

export function optionalMoney(currency: string, label = "Amount") {
  return z.preprocess((v) => (v === "" || v == null ? null : v), money(currency, { label }).nullable());
}

export const percentNumber = (min = 0, max = 100) =>
  z.coerce.number({ error: "Enter a number" }).min(min, `Minimum ${min}`).max(max, `Maximum ${max}`);

export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (out[key] ??= [] as string[]);
      (out[key] as string[]).push(v);
    } else out[k] = v;
  }
  return out;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
