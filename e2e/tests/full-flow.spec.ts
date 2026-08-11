/**
 * Full transfer flow for every lane direction the app offers.
 *
 * Per direction: the fee is quoted, the message is sent for real, and the
 * history drawer shows it and keeps polling until it settles.
 *
 * These spend testnet funds by design.
 */

import type { Page } from "@playwright/test";

import { connectAptos, connectEvm, connectSolana } from "../src/connect.js";
import { expect, test } from "../src/fixtures.js";

const PANEL = "#sdk-inspector-panel";
const DRAWER = '[role="dialog"][aria-label="Transfer History"]';

interface Direction {
  name: string;
  source: string;
  dest: string;
  /** Which wallet signs, and so which one must be able to spend. */
  signer: "evm" | "solana" | "aptos";
}

const DIRECTIONS: Direction[] = [
  {
    name: "EVM to EVM",
    source: "ethereum-testnet-sepolia",
    dest: "ethereum-testnet-sepolia-base-1",
    signer: "evm",
  },
  {
    name: "EVM to Solana",
    source: "ethereum-testnet-sepolia",
    dest: "solana-devnet",
    signer: "evm",
  },
  {
    name: "EVM to Aptos",
    source: "ethereum-testnet-sepolia",
    dest: "aptos-testnet",
    signer: "evm",
  },
  {
    name: "Solana to EVM",
    source: "solana-devnet",
    dest: "ethereum-testnet-sepolia",
    signer: "solana",
  },
  {
    name: "Aptos to EVM",
    source: "aptos-testnet",
    dest: "ethereum-testnet-sepolia",
    signer: "aptos",
  },
];

/** Text of every call entry in the inspector, phase headers filtered out. */
async function inspectorCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const panel = document.querySelector("#sdk-inspector-panel");
    if (!panel) return [];
    const phases = ["Setup", "Estimation", "Transfer", "Tracking"];
    return Array.from(panel.querySelectorAll("button[aria-expanded]"))
      .map((b) => b.textContent.replace(/[▲▼]/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((t) => !phases.some((p) => t.replace(/^\W+/, "").startsWith(p)));
  });
}

for (const dir of DIRECTIONS) {
  test.describe(dir.name, () => {
    test(`quotes, sends and tracks`, async ({ page, evmWallet, solanaWallet, aptosWallet }) => {
      test.setTimeout(600_000);

      await page.addInitScript((key: string) => {
        localStorage.setItem(key, "true");
      }, "ccip-sdk-inspector-enabled");

      await page.goto("/03-multichain-bridge-dapp/");

      // Every family connects: the source signs, the destination supplies the
      // receiver address.
      await connectEvm(page, evmWallet.address, /connect evm/i);
      await connectSolana(page, solanaWallet.address);
      await connectAptos(page, aptosWallet.address);

      const selects = page.locator("select");
      await selects.nth(0).selectOption(dir.source);
      await selects.nth(1).selectOption(dir.dest);
      await page.getByPlaceholder("0.0").fill("0.001");

      await page.getByRole("button", { name: /^estimate fee$/i }).click();

      // The fee quote.
      const fee = page
        .locator(`${PANEL} button[aria-expanded]`)
        .filter({ hasText: /getFee(?!Tokens)/ });
      await expect(fee.first()).toBeVisible({ timeout: 180_000 });

      const calls = await inspectorCalls(page);
      expect(calls.join("\n"), "fee quote logged").toMatch(/getFee(?!Tokens)/);

      // Send.
      await expect(page.getByRole("button", { name: /^transfer$/i })).toBeEnabled({
        timeout: 180_000,
      });
      await page.getByRole("button", { name: /^transfer$/i }).click();

      const sent = () => {
        if (dir.signer === "evm") return evmWallet.sentTransactions.length;
        if (dir.signer === "solana") return solanaWallet.sentTransactions.length;
        return aptosWallet.signedTransactions.length;
      };
      await expect.poll(sent, { timeout: 420_000 }).toBeGreaterThan(0);
      console.log(`${dir.name}: signed by ${dir.signer}`);

      // History lists it and keeps polling while it is unsettled.
      const polls: string[] = [];
      page.on("request", (req) => {
        if (req.url().includes("api.ccip.chain.link/v2/messages/0x")) polls.push(req.url());
      });

      await page.getByRole("button", { name: /open transfer history/i }).click();
      const drawer = page.locator(DRAWER);
      await expect(drawer).toBeVisible();
      await expect
        .poll(() => drawer.locator('a:has-text("CCIP Explorer")').count(), { timeout: 120_000 })
        .toBeGreaterThan(0);

      // A just-sent message cannot be settled yet, so the badge must show it and
      // the poller must be re-reading it.
      await expect(drawer.getByText(/in progress/i).first()).toBeVisible({ timeout: 120_000 });
      await expect.poll(() => polls.length, { timeout: 90_000 }).toBeGreaterThan(0);

      console.log(
        `${dir.name}: history rows=${await drawer.locator('a:has-text("CCIP Explorer")').count()} polls=${polls.length}`
      );
    });
  });
}
