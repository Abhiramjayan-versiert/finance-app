import { expect, test, type Page } from "@playwright/test";

/**
 * Full signed-in journey against the in-memory fake backend
 * (FINANCE_OS_FAKE_BACKEND=1 — see src/lib/firebase/fake.ts).
 */
test.describe.configure({ mode: "serial" });

const A = { name: "Asha Rao", email: `asha.${Date.now()}@example.com`, password: "Str0ngPass!" };
const B = { name: "Ben Shah", email: `ben.${Date.now()}@example.com`, password: "An0therPass!" };

async function latestCode(page: Page, email: string) {
  const res = await page.request.get(`/api/test/outbox?to=${encodeURIComponent(email)}`);
  const mails = (await res.json()) as Array<{ text: string }>;
  const m = mails.at(-1)?.text.match(/\b(\d{6})\b/);
  expect(m, "verification email").toBeTruthy();
  return m![1];
}

async function register(page: Page, u: typeof A) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(u.name);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByLabel("Confirm password").fill(u.password);
  await page.getByText("I accept the Terms and Privacy Policy").click();
  await page.getByRole("button", { name: "Create free account" }).click();
  await expect(page).toHaveURL(/\/verify/);
  await page.getByLabel("Verification code").fill(await latestCode(page, u.email));
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

// Stored as host-only cookies (url, not domain) so server-set cookies replace them.
let sessionA: Array<{ name: string; value: string; url: string }> = [];

const card = (page: Page, label: string) => page.locator("div.rounded-lg", { has: page.getByText(label, { exact: true }) }).first();

async function addTx(page: Page, kind: "income" | "expense", title: string, amount: string, category?: string) {
  await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: kind === "income" ? "Add income" : "Add expense" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel(kind === "income" ? "Income title" : "Expense name").fill(title);
  await dlg.getByLabel("Amount").fill(amount);
  if (category) await dlg.getByLabel(kind === "income" ? "Income category" : "Category", { exact: true }).selectOption({ label: category });
  await dlg.getByRole("button", { name: kind === "income" ? "Add income" : "Add expense" }).click();
  await expect(dlg).toBeHidden();
}

test("register with an email code and land on an empty dashboard", async ({ page, context }) => {
  await register(page, A);
  sessionA = (await context.cookies()).map((c) => ({ name: c.name, value: c.value, url: page.url() }));
  await expect(page.getByRole("heading", { name: /Welcome to FINANCE OS, Asha/ })).toBeVisible();
  await expect(card(page, "Available balance")).toContainText("₹0");
});

test("wrong verification codes are rejected", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Eve");
  await page.getByLabel("Email").fill(`eve.${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Str0ngPass!");
  await page.getByLabel("Confirm password").fill("Str0ngPass!");
  await page.getByText("I accept the Terms and Privacy Policy").click();
  await page.getByRole("button", { name: "Create free account" }).click();
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("That code is not valid").first()).toBeVisible();
  // Unverified users cannot reach the app.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/verify/);
});

test.describe("signed-in user", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies(sessionA);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("income and expenses update the dashboard from real records", async ({ page }) => {
    await addTx(page, "income", "Salary", "100000", "Salary");
    await addTx(page, "expense", "Dinner", "2500", "Food");
    await page.reload();
    await expect(card(page, "Income this month")).toContainText("₹1,00,000");
    await expect(card(page, "Expenses this month")).toContainText("₹2,500");
    await expect(card(page, "Available balance")).toContainText("₹97,500");
    await expect(card(page, "Savings rate")).toContainText("97.5%");
    await expect(page.getByText("Dinner")).toBeVisible();
  });

  test("budgets warn when spending passes the limit", async ({ page }) => {
    await page.goto("/budgets");
    await page.getByRole("button", { name: "New budget" }).first().click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Applies to").selectOption({ label: "Food" });
    await dlg.getByLabel("Budget amount").fill("2000");
    await dlg.getByRole("button", { name: "Create budget" }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByText("Over budget · 125%")).toBeVisible();
  });

  test("goal planner computes the MacBook example", async ({ page }) => {
    await page.goto("/goals?new=1");
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Goal name").fill("MacBook");
    await dlg.getByLabel("Target amount").fill("180000");
    await dlg.getByLabel("Current savings for this goal").fill("20000");
    await expect(dlg.getByText("Remaining").locator("..")).toContainText("₹1,60,000");
    await dlg.getByRole("button", { name: "Create goal" }).click();
    await expect(page).toHaveURL(/\/goals\/[A-Za-z0-9]+/);
    await expect(page.getByRole("heading", { name: "MacBook" })).toBeVisible();
    await expect(page.getByText("₹13,333.34").first()).toBeVisible();
    await expect(page.getByText("11.11%")).toBeVisible();
    // Contribute and see progress move.
    await page.getByRole("button", { name: "Add money" }).click();
    await page.getByRole("dialog").getByLabel("Amount").fill("40000");
    await page.getByRole("dialog").getByRole("button", { name: "Add to goal" }).click();
    await expect(page.getByText("33.33%")).toBeVisible();
  });

  test("savings transfers never change cash, income or expenses", async ({ page }) => {
    await page.goto("/savings?new=1");
    let dlg = page.getByRole("dialog");
    await dlg.getByLabel("Name").fill("Emergency fund");
    await dlg.getByLabel("Type").selectOption("emergency");
    await dlg.getByRole("button", { name: "Create account" }).click();
    await expect(dlg).toBeHidden();
    await page.getByRole("button", { name: "New savings account" }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByLabel("Name").fill("Vacation");
    await dlg.getByLabel("Existing balance").fill("1000");
    await dlg.getByRole("button", { name: "Create account" }).click();
    await expect(dlg).toBeHidden();
    const emergency = page.locator("div.rounded-lg", { has: page.getByText("Emergency fund", { exact: true }) }).first();
    await emergency.getByRole("button", { name: "Add" }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByLabel("Amount").fill("10000");
    await dlg.getByRole("button", { name: "Add savings" }).click();
    await expect(dlg).toBeHidden();
    await page.getByRole("button", { name: "Transfer" }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByLabel("Amount").fill("3000");
    await dlg.getByRole("button", { name: "Transfer" }).click();
    await expect(dlg).toBeHidden();
    await expect(emergency).toContainText("₹7,000");
    await page.goto("/dashboard");
    // 97,500 − 10,000 deposit (transfer and external opening balance are cash-neutral; goal opening was external, +40,000 contribution from cash)
    await expect(card(page, "Available balance")).toContainText("₹47,500");
    await expect(card(page, "Income this month")).toContainText("₹1,00,000");
    await expect(card(page, "Expenses this month")).toContainText("₹2,500");
  });

  test("withdrawals beyond the balance are refused", async ({ page }) => {
    await page.goto("/savings");
    const vac = page.locator("div.rounded-lg", { has: page.getByText("Vacation", { exact: true }) }).first();
    await vac.getByRole("button", { name: "Withdraw" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Amount").fill("999999");
    await dlg.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText("Insufficient balance in savings account").first()).toBeVisible();
  });

  test("investments, debts and net worth", async ({ page }) => {
    await page.goto("/investments?new=1");
    let dlg = page.getByRole("dialog");
    await dlg.getByLabel("Investment name").fill("Nifty index fund");
    await dlg.getByLabel("Amount invested").fill("50000");
    await dlg.getByLabel("Current estimated value").fill("55000");
    await dlg.getByRole("button", { name: "Add investment" }).click();
    await expect(dlg).toBeHidden();
    await expect(card(page, "Unrealised P/L")).toContainText("₹5,000");

    await page.goto("/debts?new=1");
    dlg = page.getByRole("dialog");
    await dlg.getByLabel("Loan name").fill("Bike loan");
    await dlg.getByLabel("Principal amount").fill("60000");
    await dlg.getByLabel("Outstanding amount").fill("30000");
    await dlg.getByLabel("Interest rate (% p.a.)").fill("12");
    await dlg.getByLabel("EMI", { exact: true }).fill("5000");
    await dlg.getByRole("button", { name: "Add debt" }).click();
    await expect(dlg).toBeHidden();
    await page.getByRole("button", { name: "Record payment" }).click();
    dlg = page.getByRole("dialog");
    await dlg.getByLabel("Payment amount").fill("5000");
    await expect(dlg.getByText("Interest ₹300 · principal ₹4,700")).toBeVisible();
    await dlg.getByRole("button", { name: "Record payment" }).click();
    await expect(dlg).toBeHidden();
    await expect(card(page, "Total outstanding")).toContainText("₹25,300");

    await page.goto("/net-worth");
    // cash 42,500 + savings 11,000 (7,000 + 4,000) + goal 60,000 + investments 55,000 − loan 25,300
    await expect(card(page, "Current net worth")).toContainText("₹1,43,200");
  });

  test("pages render with data: expenses, transactions, income, reports, calculators, achievements, notifications, settings", async ({ page }) => {
    for (const [path, text] of [
      ["/expenses", "Top category"], ["/transactions", "Dinner"], ["/income", "Income sources"], ["/reports", "Summary"],
      ["/calculators", "SIP calculator"], ["/achievements", "First step"], ["/notifications", "Budget alert"], ["/settings", "Preferences"], ["/net-worth", "Net worth history"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByText(text).first(), path).toBeVisible();
    }
    await page.goto("/expenses");
    await expect(page.getByRole("grid", { name: "Spending calendar" })).toBeVisible();
  });

  test("exports CSV, Excel and JSON", async ({ page }) => {
    const csv = await page.request.get("/api/export?report=transactions&format=csv");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("Dinner");
    const xlsx = await page.request.get("/api/export?report=monthly-expenses&format=xlsx");
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    const all = await (await page.request.get("/api/export?report=all&format=json")).json();
    expect(all.transactions.length).toBeGreaterThanOrEqual(2);
  });

  test("mobile layout of the dashboard has no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
});

test("a second user sees none of the first user's data and cannot open admin", async ({ page }) => {
  await register(page, B);
  await expect(card(page, "Available balance")).toContainText("₹0");
  await page.goto("/transactions");
  await expect(page.getByText("Dinner")).toHaveCount(0);
  const all = await (await page.request.get("/api/export?report=all&format=json")).json();
  expect(all.transactions).toHaveLength(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("super admin console: metrics, users, suspend, audit", async ({ page, browser }) => {
  await page.request.post("/api/test/outbox", { data: { email: A.email } });
  await page.goto("/login");
  await page.getByLabel("Email").fill(A.email);
  await page.getByLabel("Password", { exact: true }).fill(A.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/admin");
  await expect(card(page, "Registered users")).toBeVisible();
  for (const p of ["/admin/activity", "/admin/analytics", "/admin/health", "/admin/settings"]) {
    await page.goto(p);
    await expect(page.locator("main h1")).toBeVisible();
  }
  // B signs in on another device, then gets suspended.
  const bCtx = await browser.newContext();
  const bPage = await bCtx.newPage();
  await bPage.goto("/login");
  await bPage.getByLabel("Email").fill(B.email);
  await bPage.getByLabel("Password", { exact: true }).fill(B.password);
  await bPage.getByRole("button", { name: "Sign in" }).click();
  await expect(bPage).toHaveURL(/\/dashboard/);

  await page.goto(`/admin/users?q=${encodeURIComponent(B.email)}`);
  await page.getByRole("button", { name: `Manage ${B.email}` }).click();
  await page.getByRole("menuitem", { name: "Suspend" }).click();
  await page.getByRole("dialog").getByLabel(/Reason/).fill("e2e test");
  await page.getByRole("dialog").getByRole("button", { name: "Suspend user" }).click();
  await expect(page.getByText("suspended", { exact: true })).toBeVisible();

  await bPage.goto("/dashboard");
  await expect(bPage).toHaveURL(/\/login/);
  await bPage.goto("/login");
  await bPage.getByLabel("Email").fill(B.email);
  await bPage.getByLabel("Password", { exact: true }).fill(B.password);
  await bPage.getByRole("button", { name: "Sign in" }).click();
  await expect(bPage.getByText("This account has been suspended").first()).toBeVisible();
  await bCtx.close();

  await page.goto("/admin/audit");
  await expect(page.getByText("user.suspended")).toBeVisible();
});

test("change password signs out other sessions and the new password works", async ({ page, context, browser }) => {
  await context.addCookies(sessionA);
  await page.goto("/settings#security");
  await page.getByLabel("Current password").fill(A.password);
  await page.getByLabel("New password", { exact: true }).fill("N3wPassword!");
  await page.getByLabel("Confirm new password").fill("N3wPassword!");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password updated").first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/); // this device got a fresh session
  // The old session cookie (e.g. another device) is revoked.
  const other = await browser.newContext();
  await other.addCookies(sessionA);
  const op = await other.newPage();
  await op.goto("/dashboard");
  await expect(op).toHaveURL(/\/login/);
  // Old password no longer works; new one does.
  await op.getByLabel("Email").fill(A.email);
  await op.getByLabel("Password", { exact: true }).fill(A.password);
  await op.getByRole("button", { name: "Sign in" }).click();
  await expect(op.getByText("Incorrect email or password").first()).toBeVisible();
  await expect(op.getByLabel("Email")).toHaveValue(A.email); // fields are kept after a failed attempt
  await op.getByLabel("Password", { exact: true }).fill("N3wPassword!");
  await op.getByRole("button", { name: "Sign in" }).click();
  await expect(op).toHaveURL(/\/dashboard/);
  await other.close();
});
