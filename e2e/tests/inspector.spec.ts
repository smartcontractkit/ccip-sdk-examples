/**
 * SDK Inspector in example 03.
 *
 * The inspector records each SDK call the app makes, grouped by phase, with the
 * arguments, the result and a code snippet. These checks drive the app and assert
 * the calls actually surface, so a silently empty panel fails the run.
 *
 * `logSDKCall` returns early when the inspector is disabled, so a call made while
 * the panel is off is never recorded. Every spec here enables it before the
 * interaction it measures, and one spec pins that behaviour deliberately.
 */

import type { Page } from "@playwright/test";

import { connectEvm } from "../src/connect.js";
import { expect, test } from "../src/fixtures.js";

/** Matches the key `inspectorStore` persists the toggle under. */
const STORAGE_KEY = "ccip-sdk-inspector-enabled";

const PANEL = "#sdk-inspector-panel";

/** Enables the inspector before any app code runs, so setup-phase calls are kept. */
async function enableInspectorBeforeLoad(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    localStorage.setItem(key, "true");
  }, STORAGE_KEY);
}

/** Labels PhaseGroup renders for its collapsible headers. */
const PHASE_LABELS = ["Setup", "Estimation", "Transfer", "Tracking"];

/**
 * Method names of every call listed in the panel.
 *
 * Both PhaseGroup headers and CallEntry rows are `button[aria-expanded]`, so the
 * phase headers are filtered out by label; otherwise "Setup" counts as a call.
 */
async function loggedMethods(page: Page): Promise<string[]> {
  return page.evaluate((phaseLabels) => {
    const panel = document.querySelector("#sdk-inspector-panel");
    if (!panel) return [];
    return Array.from(panel.querySelectorAll("button[aria-expanded]"))
      .map((b) => b.textContent.replace(/[▲▼]/g, "").trim())
      .filter(Boolean)
      .filter((text) => !phaseLabels.some((p) => text.replace(/^\W+/, "").startsWith(p)));
  }, PHASE_LABELS);
}

/** Expands every phase group so all call entries are in the DOM. */
async function expandAllPhases(page: Page): Promise<void> {
  const headers = page.locator(`${PANEL} button[aria-expanded="false"]`);
  for (let i = 0; i < (await headers.count()); i++) {
    await headers
      .nth(i)
      .click()
      .catch(() => undefined);
  }
}

test.describe("SDK Inspector", () => {
  test("toggle opens the panel and persists across a reload", async ({ page }) => {
    await page.goto("/03-multichain-bridge-dapp/");

    const toggle = page.getByRole("button", { name: /show sdk inspector/i });
    await expect(toggle).toBeVisible();
    await expect(page.locator(PANEL)).toHaveCount(0);

    await toggle.click();
    await expect(page.locator(PANEL)).toBeVisible();
    await expect(page.getByRole("button", { name: /hide sdk inspector/i })).toBeVisible();

    // The store writes the flag to localStorage, so it should survive a reload.
    await page.reload();
    await expect(page.locator(PANEL)).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBe("true");
  });

  test("records the SDK calls made while selecting a lane", async ({ page, evmWallet }) => {
    test.setTimeout(180_000);
    await enableInspectorBeforeLoad(page);
    await page.goto("/03-multichain-bridge-dapp/");
    await expect(page.locator(PANEL)).toBeVisible();

    await connectEvm(page, evmWallet.address, /connect evm/i);

    const selects = page.locator("select");
    await selects.nth(0).selectOption("ethereum-testnet-sepolia");
    await selects.nth(1).selectOption("ethereum-testnet-sepolia-base-1");

    // Choosing a lane resolves chains, token metadata and pool config, so more
    // than one call should land.
    await expect
      .poll(async () => (await loggedMethods(page)).length, { timeout: 60_000 })
      .toBeGreaterThan(1);

    await expandAllPhases(page);
    const methods = (await loggedMethods(page)).join("\n");
    console.log("inspector calls after lane selection:\n" + methods);

    // createChain is the entry point every later SDK call is made through.
    expect(methods).toMatch(/createChain/);
    // Both ends of the lane should be built, not just the source.
    expect(methods).toMatch(/Sepolia/);
  });

  test("shows a fee call with its arguments, result and snippet", async ({ page, evmWallet }) => {
    test.setTimeout(180_000);
    await enableInspectorBeforeLoad(page);
    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);

    const selects = page.locator("select");
    await selects.nth(0).selectOption("ethereum-testnet-sepolia");
    await selects.nth(1).selectOption("ethereum-testnet-sepolia-base-1");
    await page.getByPlaceholder("0.0").fill("0.001");
    await page.getByRole("button", { name: /^estimate fee$/i }).click();

    // getFee is the call the estimate is built from.
    const feeEntry = page.locator(`${PANEL} button[aria-expanded]`).filter({ hasText: "getFee" });
    await expect(feeEntry.first()).toBeVisible({ timeout: 120_000 });

    await feeEntry.first().click(); // expand
    const panel = page.locator(PANEL);
    await expect(panel).toContainText("Arguments:");
    await expect(panel).toContainText("Result:");
    // The snippet is what makes the panel useful: real SDK code, not a log line.
    await expect(panel).toContainText(/chain\.getFee|getFee\(/);
  });

  test("no call is left pending or errored after a lane is chosen", async ({ page, evmWallet }) => {
    test.setTimeout(180_000);
    await enableInspectorBeforeLoad(page);
    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);

    const selects = page.locator("select");
    await selects.nth(0).selectOption("ethereum-testnet-sepolia");
    await selects.nth(1).selectOption("ethereum-testnet-sepolia-base-1");

    await expect
      .poll(async () => (await loggedMethods(page)).length, { timeout: 90_000 })
      .toBeGreaterThan(0);

    await page.waitForTimeout(10_000); // let in-flight calls settle

    // PhaseGroup marks a group containing a failed call with this label, so it
    // is a direct signal rather than a guess from CSS class names.
    const errorBadges = page.locator(`${PANEL} [aria-label="Has errors"]`);
    const methods = (await loggedMethods(page)).join(", ");
    expect(await errorBadges.count(), `an SDK call failed. Calls: ${methods}`).toBe(0);

    // Nothing should still be spinning once the lane has settled.
    expect(await page.locator(`${PANEL} [aria-label="In progress"]`).count()).toBe(0);
  });

  test("calls made before enabling are not recorded", async ({ page, evmWallet }) => {
    test.setTimeout(180_000);
    // Deliberately left off: logSDKCall short-circuits when disabled, so anything
    // the app does now is invisible. Worth pinning, because enabling the panel
    // partway through a session shows a misleadingly empty history.
    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);

    const selects = page.locator("select");
    await selects.nth(0).selectOption("ethereum-testnet-sepolia");
    await selects.nth(1).selectOption("ethereum-testnet-sepolia-base-1");
    await page.waitForTimeout(10_000);

    await page.getByRole("button", { name: /show sdk inspector/i }).click();
    await expect(page.locator(PANEL)).toBeVisible();

    expect(
      await loggedMethods(page),
      "enabling the inspector after the fact should show no earlier calls"
    ).toEqual([]);
  });
});
