import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testIgnore: /app-flow/, use: { ...devices["Desktop Chrome"] } },
    { name: "app-flow", testMatch: /app-flow\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: /app-flow/, use: { ...devices["Pixel 7"] } },
    { name: "tablet", testIgnore: /app-flow/, use: { ...devices["iPad Mini"], browserName: "chromium" } },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        env: { NODE_OPTIONS: "--no-experimental-require-module", FINANCE_OS_FAKE_BACKEND: "1", FAKE_DEBUG: process.env.FAKE_DEBUG ?? "", CRON_SECRET: "e2e-secret", NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}` },
        url: `http://127.0.0.1:${PORT}/offline`,
        reuseExistingServer: true,
        stdout: process.env.FAKE_DEBUG ? "pipe" : "ignore",
        timeout: 120_000,
      },
});
