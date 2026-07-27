import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 20_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm test:e2e:server",
    url: "http://127.0.0.1:4173/api/state",
    reuseExistingServer: false,
    timeout: 30_000
  }
});
