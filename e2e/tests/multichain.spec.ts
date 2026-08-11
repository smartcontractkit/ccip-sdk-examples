/**
 * Cross-family wallets, quotes and history in example 03.
 *
 * Nothing here spends: these cover the connect handshakes, that a quote reaches
 * the SDK on each cross-family lane, and that history queries every connected
 * wallet. The sends themselves live in full-flow.spec.ts.
 */

import { connectAptos, connectEvm, connectSolana } from "../src/connect.js";
import { expect, test } from "../src/fixtures.js";

const PANEL = "#sdk-inspector-panel";

test.describe("Solana wallet", () => {
  test("is offered and connects", async ({ page, solanaWallet }) => {
    test.setTimeout(120_000);
    await page.goto("/03-multichain-bridge-dapp/");

    await connectSolana(page, solanaWallet.address);
  });
});

test.describe("Aptos wallet", () => {
  test("is offered and connects", async ({ page, aptosWallet }) => {
    test.setTimeout(120_000);
    await page.goto("/03-multichain-bridge-dapp/");

    await connectAptos(page, aptosWallet.address);
  });
});

test.describe("cross-family lanes", () => {
  test("quotes an EVM to Solana transfer", async ({ page, evmWallet, solanaWallet }) => {
    test.setTimeout(240_000);
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, "true");
    }, "ccip-sdk-inspector-enabled");

    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);

    // Estimate Fee stays disabled until the destination family supplies a
    // receiver, so the Solana wallet has to be connected first.
    await connectSolana(page, solanaWallet.address);

    const selects = page.locator("select");
    await selects.nth(0).selectOption("ethereum-testnet-sepolia");
    await selects.nth(1).selectOption("solana-devnet");

    await page.getByPlaceholder("0.0").fill("0.001");
    await page.getByRole("button", { name: /^estimate fee$/i }).click();

    // The fee call must reach the SDK for the cross-family lane.
    await expect(
      page
        .locator(`${PANEL} button[aria-expanded]`)
        .filter({ hasText: /getFee(?!Tokens)/ })
        .first()
    ).toBeVisible({ timeout: 120_000 });

    const text = await page.locator(PANEL).innerText();
    console.log("EVM to Solana inspector calls:\n" + text.slice(0, 1200));
  });

  test("quotes an EVM to Aptos transfer", async ({ page, evmWallet, aptosWallet }) => {
    test.setTimeout(240_000);
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, "true");
    }, "ccip-sdk-inspector-enabled");

    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);

    await connectAptos(page, aptosWallet.address);

    const selects = page.locator("select");
    await selects.nth(0).selectOption("ethereum-testnet-sepolia");
    await selects.nth(1).selectOption("aptos-testnet");

    await page.getByPlaceholder("0.0").fill("0.001");
    await page.getByRole("button", { name: /^estimate fee$/i }).click();

    await expect(
      page
        .locator(`${PANEL} button[aria-expanded]`)
        .filter({ hasText: /getFee(?!Tokens)/ })
        .first()
    ).toBeVisible({ timeout: 120_000 });

    const text = await page.locator(PANEL).innerText();
    console.log("EVM to Aptos inspector calls:\n" + text.slice(0, 1200));
  });
});

test.describe("Solana as source", () => {
  test("quotes a Solana to EVM transfer", async ({ page, evmWallet, solanaWallet }) => {
    test.setTimeout(240_000);
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, "true");
    }, "ccip-sdk-inspector-enabled");

    await page.goto("/03-multichain-bridge-dapp/");
    // EVM supplies the destination receiver, Solana signs.
    await connectEvm(page, evmWallet.address, /connect evm/i);
    await connectSolana(page, solanaWallet.address);

    const selects = page.locator("select");
    await selects.nth(0).selectOption("solana-devnet");
    await selects.nth(1).selectOption("ethereum-testnet-sepolia");

    await page.getByPlaceholder("0.0").fill("0.001");
    await page.getByRole("button", { name: /^estimate fee$/i }).click();

    await expect(
      page
        .locator(`${PANEL} button[aria-expanded]`)
        .filter({ hasText: /getFee(?!Tokens)/ })
        .first()
    ).toBeVisible({ timeout: 120_000 });

    const text = await page.locator(PANEL).innerText();
    console.log("Solana to EVM inspector calls:\n" + text.slice(0, 1500));
  });
});

test.describe("cross-family history", () => {
  test("lists transfers sent from every connected wallet and polls the unsettled ones", async ({
    page,
    evmWallet,
    solanaWallet,
  }) => {
    test.setTimeout(300_000);

    const searches: string[] = [];
    const polls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("api.ccip.chain.link/v2/messages?")) searches.push(url);
      if (url.includes("api.ccip.chain.link/v2/messages/0x")) polls.push(url);
    });

    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);
    await connectSolana(page, solanaWallet.address);

    await page.getByRole("button", { name: /open transfer history/i }).click();
    const drawer = page.locator('[role="dialog"][aria-label="Transfer History"]');
    await expect(drawer).toBeVisible();
    await expect
      .poll(() => drawer.locator('a:has-text("CCIP Explorer")').count(), { timeout: 60_000 })
      .toBeGreaterThan(0);

    // One query per connected wallet: a message is only findable under the
    // address that sent it. The queries resolve independently, so wait for both
    // rather than reading the list the moment the first rows render.
    await expect
      .poll(() => searches.join("\n").toLowerCase(), { timeout: 60_000 })
      .toContain(evmWallet.address.toLowerCase());
    await expect
      .poll(() => searches.join("\n"), { timeout: 60_000 })
      .toContain(solanaWallet.address);

    // Solana-sourced rows must be listed, not just EVM ones.
    await expect(drawer).toContainText(/Solana Devnet/i, { timeout: 30_000 });

    // The footer names every address the list is filtered on.
    await expect(drawer).toContainText(evmWallet.address.slice(-4), { ignoreCase: true });
    await expect(drawer).toContainText(solanaWallet.address.slice(-4));

    const pendingBadge = drawer.getByText(/in progress/i);
    const hasPending = (await pendingBadge.count()) > 0;

    if (hasPending) {
      // The interval starts when the pending set is first populated, so wait for
      // a tick rather than a fixed window: a fixed wait races the interval.
      await expect
        .poll(() => polls.length, { timeout: 90_000, intervals: [2_000] })
        .toBeGreaterThan(0);
    } else {
      await page.waitForTimeout(20_000);
      expect(polls, "settled messages must never be re-read").toEqual([]);
    }
    console.log(
      `searches=${searches.length} rows=${await drawer.locator('a:has-text("CCIP Explorer")').count()} pending=${hasPending} polls=${polls.length}`
    );
  });
});
