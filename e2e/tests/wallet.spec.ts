/**
 * Wallet-connected flows against live testnet.
 *
 * Reads (balances, fees, lane config) hit the real Sepolia and Base Sepolia
 * endpoints rather than a fork. Nothing here spends: the wallet refuses
 * `eth_sendTransaction` unless CCIP_E2E_ALLOW_SEND=1, and the one spec that
 * transfers is skipped without it.
 */

import type { Page } from "@playwright/test";
import { LINK_TOKEN_ADDRESSES, MESSAGE_STAGES } from "@chainlink/ccip-examples-shared-config";

import { expect, test } from "../src/fixtures.js";

/** The only token 02 bridges; BridgeForm.tsx pins it as TOKEN_SYMBOL. */
const TRANSFER_TOKEN_SYMBOL = "CCIP-BnM";
/** Which token pays the CCIP fee. The radio group selects this, not the above. */
const FEE_TOKEN_SYMBOL = "LINK";
const TRANSFER_AMOUNT = "0.001";

/**
 * Asserts the wallet is connected.
 *
 * Matches the last four hex characters, because every UI here renders a
 * truncated address (RainbowKit shows `0x1a2b…9f0e`). Asserting on a leading slice
 * fails even when the connection succeeded.
 */
async function expectConnected(page: Page, address: string): Promise<void> {
  const tail = address.slice(-4).toLowerCase();
  await expect(page.locator("body")).toContainText(new RegExp(tail, "i"), { timeout: 30_000 });
}

/** Every `<option>` across the network selects, as "value :: label". */
async function networkOptions(page: Page): Promise<string[]> {
  await expect(page.locator("select").first()).toBeVisible({ timeout: 30_000 });
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("select"))
      .flatMap((s) => Array.from(s.options))
      .filter((o) => o.value)
      .map((o) => `${o.value} :: ${o.textContent.trim()}`)
  );
}

test.describe("02-evm-simple-bridge", () => {
  test.beforeEach(async ({ page, evmWallet }) => {
    expect(evmWallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    await page.goto("/02-evm-simple-bridge/");
  });

  test("connects the injected wallet and shows the bridge form", async ({ page, evmWallet }) => {
    await page.getByRole("button", { name: /connect wallet/i }).click();

    // RainbowKit lists the EIP-6963 provider under its announced name.
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await modal
      .getByRole("button", { name: /e2e test wallet/i })
      .first()
      .click();

    // Connected state: the truncated address appears somewhere in the UI.
    await expectConnected(page, evmWallet.address);
  });

  test("offers Avalanche Fuji as a lane", async ({ page, evmWallet }) => {
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /e2e test wallet/i })
      .first()
      .click();
    await expectConnected(page, evmWallet.address);

    // Fuji is configured but unused by the other specs, so its absence would
    // otherwise go unnoticed.
    const options = await networkOptions(page);
    expect(options.join("\n")).toMatch(/fuji/i);
    console.log("02 network options:\n" + options.join("\n"));
  });

  test("reads live testnet state once connected", async ({ page, consoleLog }) => {
    await page.getByRole("button", { name: /connect wallet/i }).click();
    const modal = page.getByRole("dialog");
    await modal
      .getByRole("button", { name: /e2e test wallet/i })
      .first()
      .click();

    // A balance or fee figure proves real RPC reads resolved, not just a render.
    await expect(page.locator("body")).toContainText(/\d+\.\d+|balance|fee/i, { timeout: 30_000 });
    expect(consoleLog.unexpectedErrors(), "unexpected console errors").toEqual([]);
  });
});

test.describe("03-multichain-bridge-dapp", () => {
  test("offers all three wallet families", async ({ page }) => {
    await page.goto("/03-multichain-bridge-dapp/");
    await expect(page.getByRole("button", { name: /connect evm/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /connect solana/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /connect aptos/i })).toBeVisible();
  });

  test("offers Solana devnet and Aptos testnet as lanes", async ({ page, evmWallet }) => {
    await page.goto("/03-multichain-bridge-dapp/");
    await page.getByRole("button", { name: /connect evm/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /e2e test wallet/i })
      .first()
      .click();
    await expectConnected(page, evmWallet.address);

    // Non-EVM destinations are what this app exists to show; without these
    // options no cross-family transfer is reachable from the UI.
    const options = await networkOptions(page);
    expect(options.join("\n")).toMatch(/solana/i);
    expect(options.join("\n")).toMatch(/aptos/i);
    console.log("03 network options:\n" + options.join("\n"));
  });

  test("connects the EVM wallet", async ({ page, evmWallet }) => {
    await page.goto("/03-multichain-bridge-dapp/");
    await page.getByRole("button", { name: /connect evm/i }).click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await modal
      .getByRole("button", { name: /e2e test wallet/i })
      .first()
      .click();

    await expectConnected(page, evmWallet.address);
  });
});

test.describe("live transfer", () => {
  // Spends real testnet funds, so it is opt-in.
  test.skip(
    process.env.CCIP_E2E_ALLOW_SEND !== "1",
    "set CCIP_E2E_ALLOW_SEND=1 to run the spending test"
  );

  test("sends a CCIP transfer from the UI", async ({ page, evmWallet }) => {
    test.setTimeout(300_000); // approval + send + CCIP confirmation

    await page.goto("/02-evm-simple-bridge/");
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /e2e test wallet/i })
      .first()
      .click();

    await expectConnected(page, evmWallet.address);

    // Lane first: the fee-token options only render once both networks are set.
    const selects = page.locator("select");
    await selects.nth(0).selectOption("ethereum-testnet-sepolia");
    await selects.nth(1).selectOption("ethereum-testnet-sepolia-base-1");

    // The radio group picks the FEE token, not the transferred one: this app
    // always bridges CCIP-BnM (BridgeForm.tsx pins TOKEN_SYMBOL). Balances are
    // read live, so a fee token the wallet does not hold renders disabled.
    // Selected by visible symbol rather than by address, which stays owned by
    // the app's config.
    const feeToken = page.getByRole("radio", { name: new RegExp(FEE_TOKEN_SYMBOL, "i") });
    await expect(feeToken).toBeEnabled({ timeout: 30_000 });
    await feeToken.check();
    // Ties the selected radio back to the app's own config, so the two cannot
    // drift without a failure.
    const expectedFeeToken = LINK_TOKEN_ADDRESSES["ethereum-testnet-sepolia"];
    expect(expectedFeeToken, "shared-config has no LINK address for Sepolia").toBeTruthy();
    await expect(feeToken).toHaveValue(String(expectedFeeToken));

    await page.getByPlaceholder("0.0").fill(TRANSFER_AMOUNT);

    await page.getByRole("button", { name: /^estimate fee$/i }).click();
    await expect(page.getByRole("button", { name: /^transfer$/i })).toBeEnabled({
      timeout: 60_000,
    });

    // Re-check right before submitting: the options re-render as balances land,
    // so a selection made earlier could silently be reset.
    await expect(feeToken).toBeChecked();

    // Count CCIP API reads for this message. A single fetch would satisfy any
    // UI assertion, so the polling behaviour is measured on the network instead.
    const statusPolls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("api.ccip.chain.link/v2/messages")) statusPolls.push(req.url());
    });

    await page.getByRole("button", { name: /^transfer$/i }).click();

    // Asserts the send reached the chain, rather than asserting on UI copy.
    await expect
      .poll(() => evmWallet.sentTransactions.length, { timeout: 240_000 })
      .toBeGreaterThan(0);

    console.log(`sent ${TRANSFER_AMOUNT} ${TRANSFER_TOKEN_SYMBOL}, fee in ${FEE_TOKEN_SYMBOL}`);
    console.log("transactions:", evmWallet.sentTransactions);

    // The progress stepper renders every stage from MESSAGE_STAGES.
    for (const stage of MESSAGE_STAGES) {
      await expect(page.getByText(stage.label, { exact: false }).first()).toBeVisible({
        timeout: 120_000,
      });
    }

    // Polling, not a one-shot read. The history poller re-reads every
    // POLLING_CONFIG.initialDelay (15s), so a 90s window should catch several.
    await expect
      .poll(() => statusPolls.length, { timeout: 90_000, intervals: [5_000] })
      .toBeGreaterThan(1);

    // The id is read from the explorer link, because the label on screen is
    // truncated for display and never carries the full 32 bytes.
    const explorerLink = page.locator('a[href*="ccip.chain.link/msg/"]').first();
    await expect(explorerLink, "a messageId should be surfaced after sending").toBeVisible({
      timeout: 120_000,
    });
    const messageId = await explorerLink
      .getAttribute("href")
      .then((h) => /0x[0-9a-fA-F]{64}/.exec(h ?? "")?.[0]);
    expect(messageId, "the explorer link should carry the full messageId").toBeTruthy();

    console.log(`messageId ${messageId}, ${statusPolls.length} status polls observed`);
  });
});
