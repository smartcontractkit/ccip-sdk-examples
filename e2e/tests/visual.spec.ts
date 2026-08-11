/**
 * Captures full-page screenshots of each app's main states.
 *
 * Headless Chromium runs the same engine as the visible browser (real layout,
 * CSS, web fonts and paint), so these images show what a user sees and are the
 * artefact to review for spacing, contrast, truncation and error states.
 *
 * Run `pnpm -F e2e test:headed` to watch it happen in a real window instead.
 *
 * Images land in `screenshots/` and are overwritten each run, so the directory
 * reflects the current build rather than accumulating history.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "../src/fixtures.js";

const SHOTS = resolve(fileURLToPath(new URL(".", import.meta.url)), "../screenshots");
mkdirSync(SHOTS, { recursive: true });

const shot = (name: string) => resolve(SHOTS, `${name}.png`);

test("captures the landing page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({ path: shot("00-landing"), fullPage: true });
});

test("captures 02 before and after connecting", async ({ page, evmWallet }) => {
  await page.goto("/02-evm-simple-bridge/");
  await expect(page.getByRole("button", { name: /connect wallet/i })).toBeVisible();
  await page.screenshot({ path: shot("02-disconnected"), fullPage: true });

  await page.getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: shot("02-wallet-modal"), fullPage: true });

  await page
    .getByRole("dialog")
    .getByRole("button", { name: /e2e test wallet/i })
    .first()
    .click();
  await expect(page.locator("body")).toContainText(new RegExp(evmWallet.address.slice(-4), "i"), {
    timeout: 30_000,
  });
  await page.screenshot({ path: shot("02-connected"), fullPage: true });

  // The main working state: lane chosen, balances loaded.
  const selects = page.locator("select");
  await selects.nth(0).selectOption("ethereum-testnet-sepolia");
  await selects.nth(1).selectOption("ethereum-testnet-sepolia-base-1");
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: shot("02-lane-selected"), fullPage: true });
});

test("captures 03 connected", async ({ page, evmWallet }) => {
  await page.goto("/03-multichain-bridge-dapp/");
  await page.screenshot({ path: shot("03-disconnected"), fullPage: true });

  await page.getByRole("button", { name: /connect evm/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /e2e test wallet/i })
    .first()
    .click();
  await expect(page.locator("body")).toContainText(new RegExp(evmWallet.address.slice(-4), "i"), {
    timeout: 30_000,
  });
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: shot("03-connected"), fullPage: true });
});

test("captures 02 on a narrow viewport", async ({ page }) => {
  // Phone-width viewport: the form is the first layout to break when narrow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/02-evm-simple-bridge/");
  await expect(page.getByRole("button", { name: /connect wallet/i })).toBeVisible();
  await page.screenshot({ path: shot("02-mobile"), fullPage: true });
});

test("captures the transfer history drawer", async ({ page, evmWallet }) => {
  test.setTimeout(180_000);
  await page.goto("/03-multichain-bridge-dapp/");
  await page.getByRole("button", { name: /connect evm/i }).click();
  const entry = page
    .getByRole("dialog")
    .getByRole("button", { name: /e2e test wallet/i })
    .first();
  await expect(entry).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await entry.click({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText(new RegExp(evmWallet.address.slice(-4), "i"), {
      timeout: 10_000,
    });
  }).toPass({ timeout: 60_000 });

  await page.getByRole("button", { name: /open transfer history/i }).click();
  await expect(page.locator('[role="dialog"][aria-label="Transfer History"]')).toBeVisible();
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: shot("03-history-drawer"), fullPage: true });
});

test("captures the inspector during a fee estimate", async ({ page, evmWallet }) => {
  test.setTimeout(180_000);
  await page.addInitScript((key: string) => {
    localStorage.setItem(key, "true");
  }, "ccip-sdk-inspector-enabled");
  await page.goto("/03-multichain-bridge-dapp/");
  await page.getByRole("button", { name: /connect evm/i }).click();
  const entry = page
    .getByRole("dialog")
    .getByRole("button", { name: /e2e test wallet/i })
    .first();
  await expect(entry).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await entry.click({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText(new RegExp(evmWallet.address.slice(-4), "i"), {
      timeout: 10_000,
    });
  }).toPass({ timeout: 60_000 });

  const selects = page.locator("select");
  await selects.nth(0).selectOption("ethereum-testnet-sepolia");
  await selects.nth(1).selectOption("ethereum-testnet-sepolia-base-1");
  await page.getByPlaceholder("0.0").fill("0.001");
  await page.getByRole("button", { name: /^estimate fee$/i }).click();
  await page.waitForTimeout(20_000);
  await page.screenshot({ path: shot("03-inspector-estimate"), fullPage: true });
});
