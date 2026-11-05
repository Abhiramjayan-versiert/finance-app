import { expect, test } from "@playwright/test";

test.describe("public site", () => {
  test("landing page renders the brand and calls to action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your Money. Your Goals.");
    await expect(page.getByRole("link", { name: /Create your free account/ })).toBeVisible();
  });

  test("has no horizontal scroll on any viewport", async ({ page }) => {
    for (const path of ["/", "/tools/calculators", "/login", "/register"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });

  test("calculators compute correct values (EMI and SIP)", async ({ page }) => {
    await page.goto("/tools/calculators");
    const emi = page.locator("#emi");
    await emi.getByLabel("Loan amount").fill("1000000");
    await emi.getByLabel("Interest rate").fill("10");
    await emi.getByLabel("Tenure").fill("240");
    await expect(emi).toContainText("₹9,650.22");
    const sip = page.locator("#sip");
    await sip.getByLabel("Monthly investment").fill("5000");
    await sip.getByLabel("Expected return").fill("12");
    await sip.getByLabel("Years").fill("10");
    await expect(sip).toContainText("₹11,61,695.38");
  });

  test("calculator inputs validate non-numeric values", async ({ page }) => {
    await page.goto("/tools/calculators");
    const si = page.locator("#simple");
    await si.getByLabel("Principal").fill("abc");
    await expect(si).toContainText("Enter a number");
  });
});

test.describe("authentication gating", () => {
  for (const path of ["/dashboard", "/transactions", "/goals", "/admin", "/settings"]) {
    test(`${path} redirects unauthenticated visitors to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    });
  }

  test("API routes reject unauthenticated requests", async ({ request }) => {
    expect((await request.get("/api/export?report=all&format=json")).status()).toBe(401);
    expect((await request.get("/api/cron/daily")).status()).toBe(401);
  });

  test("registration validates input on the server and shows field errors", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Test User");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("weak");
    await page.getByLabel("Confirm password").fill("different");
    await page.getByRole("button", { name: "Create free account" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();
    await expect(page.getByText("Passwords do not match")).toBeVisible();
    await expect(page.getByText("You must accept the terms to continue")).toBeVisible();
  });

  test("login validates required fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
  });

  test("verify page requires a numeric code", async ({ page }) => {
    await page.goto("/verify?email=user%40example.com");
    await page.getByLabel("Verification code").fill("12ab");
    await page.getByRole("button", { name: "Verify email" }).click();
    await expect(page.getByText("Enter the code from your email")).toBeVisible();
  });
});

test.describe("PWA & security", () => {
  test("serves a valid web app manifest and service worker", async ({ request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    expect(m.display).toBe("standalone");
    expect(m.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-store");
    for (const icon of m.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  });

  test("sends security headers", async ({ request }) => {
    const h = (await request.get("/")).headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["strict-transport-security"]).toContain("max-age");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("offline page is available", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  });

  test("theme defaults to dark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
