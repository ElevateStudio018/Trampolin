import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DB = "postgres://trampolin:trampolin@localhost:5432/trampolin_e2e";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /visual\.spec\.ts/ },
  ],
  webServer: {
    // Requires `npm run build` first.
    command: "sh e2e/start-server.sh",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      DATABASE_URL: E2E_DB,
      APP_ORIGIN: `http://localhost:${PORT}`,
      STORAGE_DIR: "./storage-e2e",
      ANTHROPIC_API_KEY: "",
      // Every e2e sign-up comes from 127.0.0.1.
      SIGNUP_RATE_LIMIT_PER_HOUR: "1000",
      SEARCH_PROVIDER: "",
      VIDEO_MODEL_ENDPOINT: "",
    },
  },
});
