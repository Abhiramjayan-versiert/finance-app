import "server-only";
import { z } from "zod";
import { fieldErrors, formDataToObject } from "@/lib/validation/common";
import { AuthError } from "@/lib/auth";
import { logServerError } from "./errors";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const ok = <T = undefined>(message?: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
export const fail = (error: string, fe?: Record<string, string>): ActionResult<never> => ({ ok: false, error, fieldErrors: fe });

export function parseForm<S extends z.ZodTypeAny>(schema: S, fd: FormData): { ok: true; data: z.output<S> } | { ok: false; result: ActionResult<never> } {
  const parsed = schema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, result: fail("Please fix the highlighted fields.", fieldErrors(parsed.error)) };
  return { ok: true, data: parsed.data };
}

/** Maps Postgres/PostgREST errors to safe user-facing messages. */
export function dbErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return "Something went wrong";
  switch (err.code) {
    case "23505":
      return "This already exists (duplicate).";
    case "23503":
      return "A related record was not found or does not belong to you.";
    case "23514":
    case "P0001":
      // Our own trigger/check messages are written for users.
      return err.message && !/violates check constraint/.test(err.message) ? err.message : "The values entered are not allowed.";
    case "22023":
      return err.message ?? "Invalid value.";
    case "42501":
      return "You do not have permission to do that.";
    case "PGRST116":
      return "Record not found.";
    default:
      return "Something went wrong while saving. Please try again.";
  }
}

/** Wraps a server action body with auth/unknown error handling. */
export async function guarded<T>(fn: () => Promise<ActionResult<T>>, context: string): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    // Let Next.js redirects / notFound propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest?: unknown }).digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
    await logServerError(e, context);
    return fail("Something went wrong. Please try again.");
  }
}
