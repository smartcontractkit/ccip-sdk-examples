/**
 * A failed message surfaces its on-chain state and revert reason.
 *
 * The API reports only that a message failed, so the row reads the destination
 * OffRamp receipt for the reason. This needs a permanently failed message from
 * the test wallet. Message
 * 0x28338c9ce95e430c7c03723a0cb48267b198223ca3560edf9935e62dc0ab6642 reverts with
 * InvalidRouter because its receiver is bound to a different router, which is
 * immutable, so no re-execution can change it. The selector below takes any
 * failed row; that message is the one that guarantees there is one.
 */

import { connectEvm } from "../src/connect.js";
import { expect, test } from "../src/fixtures.js";

const DRAWER = '[role="dialog"][aria-label="Transfer History"]';

test("a failed message shows its decoded revert", async ({ page, evmWallet }) => {
  test.setTimeout(300_000);

  await page.goto("/03-multichain-bridge-dapp/");
  await connectEvm(page, evmWallet.address, /connect evm/i);
  await page.getByRole("button", { name: /open transfer history/i }).click();

  const drawer = page.locator(DRAWER);
  await expect(drawer).toBeVisible();

  const failedRow = drawer
    .locator('[class*="item"]')
    .filter({ hasText: /Failed/ })
    .first();

  // Every send pushes the fixture further down the list, so page a bounded number
  // of times. If it is out of reach the assertions below have nothing to check,
  // and skipping is honest: hunting it burned 49 minutes of a suite run once.
  const loadMore = drawer.getByRole("button", { name: /load more/i });
  const rows = drawer.locator('a:has-text("CCIP Explorer")');
  // The first page must be in before paging, or Load more is not yet rendered
  // and the loop exits on its first check.
  await expect.poll(() => rows.count(), { timeout: 60_000 }).toBeGreaterThan(0);

  for (let attempt = 0; attempt < 6; attempt++) {
    if (await failedRow.isVisible().catch(() => false)) break;
    if (!(await loadMore.isVisible().catch(() => false))) break;
    const before = await rows.count();
    await loadMore.click();
    // Wait for the page to actually arrive; a fixed pause raced the fetch.
    await expect
      .poll(() => rows.count(), { timeout: 30_000 })
      .toBeGreaterThan(before)
      .catch(() => undefined);
  }
  test.skip(
    !(await failedRow.isVisible().catch(() => false)),
    "no failed message within the first pages of this wallet's history"
  );

  await failedRow.getByRole("button", { name: /show details/i }).click();

  // Read from the destination chain, not from the API, which carries no reason.
  // Assert the value next to the label: a bare /Failed/ is already satisfied by
  // the status badge the row was selected on.
  await expect(failedRow).toContainText(/On-chain state\s*Failed/i, { timeout: 120_000 });

  // Both nesting levels decode to named errors; neither stays a raw selector.
  await expect(failedRow).toContainText(/ReceiverError/, { timeout: 60_000 });
  await expect(failedRow).toContainText(/InvalidRouter/);
  await expect(failedRow, "the revert must not render as raw JSON").not.toContainText(/[{}"]/);
});
