import { defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "./src/server/crypto";

process.env.LOCAL_TEST_DATABASE_PATH ??= mkdtempSync(join(tmpdir(), "bonding-quiz-e2e-"));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/game.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:3300",
    browserName: "chromium",
    reducedMotion: "reduce",
    launchOptions: existsSync(chrome) ? { executablePath: chrome } : {},
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:3300",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      APP_URL: "http://127.0.0.1:3300",
      ALLOW_LOCAL_TEST_DATABASE: "1",
      LOCAL_TEST_DATABASE_PATH: process.env.LOCAL_TEST_DATABASE_PATH,
      HOST_PASSWORD_HASH: hashPassword("e2e-private-host-password"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
