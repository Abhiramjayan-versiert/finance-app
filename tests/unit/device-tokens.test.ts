import { beforeAll, describe, expect, it } from "vitest";

// Use the in-memory fake backend (never active on Vercel).
process.env.FINANCE_OS_FAKE_BACKEND = "1";
delete process.env.VERCEL;

type Mod = typeof import("@/server/device-tokens");
let D: Mod;
let store: import("@/lib/firebase/store").Store;
beforeAll(async () => {
  D = await import("@/server/device-tokens");
  store = (await import("@/lib/firebase/admin")).getStore();
});

describe("remembered-device keys", () => {
  it("restores once, then the key is used up", async () => {
    const t = await D.issueDeviceToken("user123", "android");
    expect(await D.consumeDeviceToken(t)).toEqual({ uid: "user123", platform: "android" });
    expect(await D.consumeDeviceToken(t)).toBeNull(); // no replay
  });

  it("rejects tampered and malformed keys", async () => {
    const t = await D.issueDeviceToken("user123", "android");
    const [uid, id] = t.split(".");
    expect(await D.consumeDeviceToken(`${uid}.${id}.${"x".repeat(43)}`)).toBeNull();
    expect(await D.consumeDeviceToken(t)).toBeNull(); // a wrong guess burns the key too
    expect(await D.consumeDeviceToken("not-a-token")).toBeNull();
    expect(await D.consumeDeviceToken("a.b.c.d")).toBeNull();
  });

  it("rejects expired keys", async () => {
    const t = await D.issueDeviceToken("user456", "ios");
    const [uid, id] = t.split(".");
    await store.update(`users/${uid}/devices/${id}`, { expires_at: Date.now() - 1 });
    expect(await D.consumeDeviceToken(t)).toBeNull();
  });

  it("sign-out and password change revoke keys", async () => {
    const a = await D.issueDeviceToken("user789", "android");
    await D.revokeDeviceToken(a);
    expect(await D.consumeDeviceToken(a)).toBeNull();
    const b = await D.issueDeviceToken("user789", "android");
    const c = await D.issueDeviceToken("user789", "ios");
    await D.revokeAllDeviceTokens("user789");
    expect(await D.consumeDeviceToken(b)).toBeNull();
    expect(await D.consumeDeviceToken(c)).toBeNull();
  });
});
