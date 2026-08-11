import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

const HERE = fileURLToPath(new URL(".", import.meta.url));

// e2e/.env first, then the repo root, so a shared root .env still works.
dotenv.config({ path: resolve(HERE, ".env") });
dotenv.config({ path: resolve(HERE, "../.env") });

const PORT = Number(process.env.CCIP_E2E_PORT ?? 8800);
const DIST = resolve(HERE, "../dist");

if (!existsSync(DIST)) {
  throw new Error(`dist/ not found at ${DIST}. Run "pnpm build:site" from the repo root first.`);
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // one wallet, one nonce sequence
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 90_000, // live testnet RPC, not a local fork
  expect: { timeout: 15_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // CCIP_E2E_BROWSER_CHANNEL=chrome runs the installed Google Chrome instead of
  // Playwright's bundled Chromium, which is unsupported on macOS 13
  // ("Playwright does not support chromium on mac13"). CI leaves it unset.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CCIP_E2E_BROWSER_CHANNEL
          ? { channel: process.env.CCIP_E2E_BROWSER_CHANNEL }
          : {}),
      },
    },
  ],

  // Serves dist/ with vercel.json's headers and rewrites, so the CSP under test
  // is the one production actually sends.
  webServer: {
    command: `npx tsx src/csp-server.ts`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { PORT: String(PORT) },
  },
});
