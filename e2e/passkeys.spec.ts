import { expect, test, type Page } from "@playwright/test";

/** Face ID / fingerprint sign-in (WebAuthn passkeys) using Chrome's virtual authenticator. */
test.describe.configure({ mode: "serial" });

const U = { name: "Pia Key", email: `pia.${Date.now()}@example.com`, password: "Str0ngPass!" };

async function latestCode(page: Page, email: string) {
  const mails = (await (await page.request.get(`/api/test/outbox?to=${encodeURIComponent(email)}`)).json()) as Array<{ text: string }>;
  return mails.at(-1)!.text.match(/\b(\d{6})\b/)![1];
}

async function withAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

test("set up Face ID, sign in with it, then remove it", async ({ page }) => {
  const { cdp, authenticatorId } = await withAuthenticator(page);

  // Register + verify.
  await page.goto("/register");
  await page.getByLabel("Full name").fill(U.name);
  await page.getByLabel("Email").fill(U.email);
  await page.getByLabel("Password", { exact: true }).fill(U.password);
  await page.getByLabel("Confirm password").fill(U.password);
  await page.getByText("I accept the Terms and Privacy Policy").click();
  await page.getByRole("button", { name: "Create free account" }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.getByLabel("Verification code").fill(await latestCode(page, U.email));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Set up a passkey in Settings → Security.
  await page.goto("/settings#security");
  await page.getByRole("button", { name: /^Set up / }).click();
  await expect(page.getByText(/sign-in is on for this device/)).toBeVisible();
  await expect(page.getByText(/^Added /)).toBeVisible();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(1);
  expect(credentials[0].isResidentCredential).toBe(true);

  // Sign out, then sign in with no email or password.
  await page.getByRole("button", { name: "Sign out of this device" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: /^Sign in with / }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Pia/ })).toBeVisible();

  // Remove it; the same device can no longer sign in.
  await page.goto("/settings#security");
  await page.getByRole("button", { name: /^Remove / }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Passkey removed")).toBeVisible();
  await page.getByRole("button", { name: "Sign out of this device" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: /^Sign in with / }).click();
  await expect(page.getByText(/isn't linked to an account/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("a device with no passkey for this account cannot sign in", async ({ page }) => {
  await withAuthenticator(page);
  await page.goto("/login");
  await page.getByRole("button", { name: /^Sign in with / }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
