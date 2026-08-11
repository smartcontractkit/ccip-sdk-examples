/**
 * API-backed transfer history in example 03.
 *
 * History is read from the CCIP API filtered by sender, so these run against
 * whatever the connected wallet has actually sent.
 */

import type { Page } from "@playwright/test";

import { connectEvm } from "../src/connect.js";
import { expect, test } from "../src/fixtures.js";

const DRAWER = '[role="dialog"][aria-label="Transfer History"]';

/** Number of history rows currently rendered. */
async function rowCount(page: Page): Promise<number> {
  return page.locator(`${DRAWER} a:has-text("CCIP Explorer")`).count();
}

test.describe("transfer history", () => {
  test("loads the connected wallet's messages from the API", async ({
    page,
    evmWallet,
    consoleLog,
  }) => {
    test.setTimeout(180_000);

    const searchCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("api.ccip.chain.link/v2/messages?")) searchCalls.push(req.url());
    });

    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);

    await page.getByRole("button", { name: /open transfer history/i }).click();
    await expect(page.locator(DRAWER)).toBeVisible();

    await expect.poll(() => rowCount(page), { timeout: 60_000 }).toBeGreaterThan(0);

    // The query must be filtered by the connected wallet, not fetch everything.
    expect(searchCalls.length).toBeGreaterThan(0);
    expect(searchCalls[0]?.toLowerCase()).toContain(evmWallet.address.toLowerCase());

    // The footer names the address the list is filtered on.
    await expect(page.locator(DRAWER)).toContainText(evmWallet.address.slice(-4), {
      ignoreCase: true,
    });

    console.log(`history rows: ${await rowCount(page)}, search calls: ${searchCalls.length}`);
    expect(consoleLog.unexpectedErrors(), "unexpected console errors").toEqual([]);
  });

  test("Load more appends a page without dropping the rows already shown", async ({
    page,
    evmWallet,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);
    await page.getByRole("button", { name: /open transfer history/i }).click();
    await expect.poll(() => rowCount(page), { timeout: 60_000 }).toBeGreaterThan(0);

    const before = await rowCount(page);
    const loadMore = page.getByRole("button", { name: /^load more$/i });

    if ((await loadMore.count()) === 0) {
      test.skip(true, "wallet history fits in one page, nothing to page through");
      return;
    }

    await loadMore.click();
    await expect.poll(() => rowCount(page), { timeout: 60_000 }).toBeGreaterThan(before);
    console.log(`rows ${before} -> ${await rowCount(page)}`);
  });

  test("scrolling to the last row loads the next page", async ({ page, evmWallet }) => {
    test.setTimeout(180_000);
    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);
    await page.getByRole("button", { name: /open transfer history/i }).click();
    await expect.poll(() => rowCount(page), { timeout: 60_000 }).toBeGreaterThan(0);

    const before = await rowCount(page);
    if ((await page.getByRole("button", { name: /^load more$/i }).count()) === 0) {
      test.skip(true, "wallet history fits in one page, nothing to page through");
      return;
    }

    // The sentinel sits below the last row; scrolling it into view trips the observer.
    await page.locator(`${DRAWER} a:has-text("CCIP Explorer")`).last().scrollIntoViewIfNeeded();
    await expect.poll(() => rowCount(page), { timeout: 60_000 }).toBeGreaterThan(before);
  });

  test("only unsettled messages are re-polled", async ({ page, evmWallet }) => {
    test.setTimeout(180_000);

    const byIdCalls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      // getMessageById is /v2/messages/<id>; the search is /v2/messages?<query>.
      if (url.includes("api.ccip.chain.link/v2/messages/0x")) byIdCalls.push(url);
    });

    await page.goto("/03-multichain-bridge-dapp/");
    await connectEvm(page, evmWallet.address, /connect evm/i);
    await page.getByRole("button", { name: /open transfer history/i }).click();
    await expect.poll(() => rowCount(page), { timeout: 60_000 }).toBeGreaterThan(0);

    const badge = page.locator(`${DRAWER}`).getByText(/in progress/i);
    const hasPending = (await badge.count()) > 0;

    // One polling interval plus slack.
    await page.waitForTimeout(20_000);

    if (hasPending) {
      expect(byIdCalls.length, "unsettled messages should be re-read").toBeGreaterThan(0);
    } else {
      expect(byIdCalls, "settled messages must never be re-read").toEqual([]);
    }
    console.log(`pending badge: ${hasPending}, getMessageById calls: ${byIdCalls.length}`);
  });
});
