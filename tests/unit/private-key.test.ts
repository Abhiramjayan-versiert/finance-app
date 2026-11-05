import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createPrivateKey } from "node:crypto";
import { normalizePrivateKey } from "@/lib/env.server";

const pem = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const escaped = pem.replace(/\n/g, "\\n");
const valid = (k: string) => {
  createPrivateKey(normalizePrivateKey(k));
  return true;
};

describe("normalizePrivateKey", () => {
  it("accepts every common way of pasting the key", () => {
    expect(valid(pem)).toBe(true);
    expect(valid(escaped)).toBe(true);
    expect(valid(`"${escaped}"`)).toBe(true);
    expect(valid(`"${escaped}",`)).toBe(true);
    expect(valid(pem.replace(/\n/g, " "))).toBe(true);
    expect(valid(JSON.stringify({ type: "service_account", private_key: pem, client_email: "x@y" }))).toBe(true);
    expect(valid(`  ${escaped}  \n`)).toBe(true);
  });
});
