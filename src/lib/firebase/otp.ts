import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";
import { getStore } from "./admin";

/**
 * One-time email codes (6 digits). Only an HMAC of the code is stored, codes
 * expire after 10 minutes, allow 5 attempts and are deleted once used.
 */
export const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Purpose = "verify" | "reset";
const key = (purpose: Purpose, email: string) => `otp_codes/${createHash("sha256").update(`${purpose}:${email.toLowerCase()}`).digest("hex").slice(0, 40)}`;
const digest = (code: string) => createHmac("sha256", serverEnv.otpSecret || "dev-only").update(code).digest("hex");

export async function issueOtp(purpose: Purpose, email: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await getStore().set(key(purpose, email), { hash: digest(code), expires_at: Date.now() + OTP_TTL_MS, attempts: 0, created_at: new Date().toISOString() });
  return code;
}

export type OtpResult = "ok" | "invalid" | "expired" | "locked";

export async function consumeOtp(purpose: Purpose, email: string, code: string): Promise<OtpResult> {
  const path = key(purpose, email);
  return getStore().transaction(async (tx) => {
    const rec = await tx.get<{ hash: string; expires_at: number; attempts: number }>(path);
    if (!rec) return "invalid";
    if (rec.expires_at < Date.now()) {
      tx.delete(path);
      return "expired";
    }
    if (rec.attempts >= MAX_ATTEMPTS) {
      tx.delete(path);
      return "locked";
    }
    const a = Buffer.from(rec.hash, "hex");
    const b = Buffer.from(digest(code), "hex");
    if (a.length === b.length && timingSafeEqual(a, b)) {
      tx.delete(path);
      return "ok";
    }
    tx.update(path, { attempts: rec.attempts + 1 });
    return "invalid";
  });
}
