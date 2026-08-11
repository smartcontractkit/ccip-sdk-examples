/**
 * Wallet connection helpers shared by the specs.
 */

import { expect, type Page } from "@playwright/test";

/**
 * Connects the injected EVM wallet through RainbowKit.
 *
 * The modal lists the provider from its EIP-6963 announcement, which can land
 * after the modal opens. Reopening the modal re-runs the discovery, so the whole
 * open-and-pick sequence retries rather than just the click.
 */
export async function connectEvm(page: Page, address: string, openLabel = /connect wallet/i) {
  const connected = () =>
    expect(page.locator("body")).toContainText(new RegExp(address.slice(-4), "i"), {
      timeout: 10_000,
    });

  await expect(async () => {
    const dialog = page.getByRole("dialog");
    if ((await dialog.count()) === 0) {
      await page.getByRole("button", { name: openLabel }).first().click({ timeout: 5_000 });
    }
    const entry = dialog.getByRole("button", { name: /e2e test wallet/i }).first();
    await expect(entry).toBeVisible({ timeout: 10_000 });
    await entry.click({ timeout: 5_000 });
    await connected();
  }).toPass({ timeout: 90_000 });
}

/** Connects the Solana wallet through the adapter's own modal. */
export async function connectSolana(page: Page, address: string) {
  await expect(async () => {
    await page.getByRole("button", { name: /connect solana/i }).click({ timeout: 5_000 });
    const phantom = page.getByRole("button", { name: /phantom/i }).first();
    await expect(phantom).toBeVisible({ timeout: 10_000 });
    await phantom.click({ timeout: 5_000 });
    // Assert the button itself flipped out of its disconnected label. Matching
    // the address anywhere in the body passes while the wallet is still
    // disconnected, because the drawer and form echo addresses too.
    await expect(page.getByRole("button", { name: /connect solana/i })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(page.locator("body")).toContainText(address.slice(-4), { timeout: 15_000 });
  }).toPass({ timeout: 90_000 });
}

/**
 * Connects the Aptos wallet.
 *
 * The app picks `wallets[0]` with no modal, so a click before the wallet-standard
 * registry has populated is a silent no-op. Retrying covers that window.
 */
export async function connectAptos(page: Page, address: string) {
  await expect(async () => {
    await page.getByRole("button", { name: /connect aptos/i }).click({ timeout: 5_000 });
    await expect(page.locator("body")).toContainText(address.slice(-4), { timeout: 15_000 });
  }).toPass({ timeout: 90_000 });
}
