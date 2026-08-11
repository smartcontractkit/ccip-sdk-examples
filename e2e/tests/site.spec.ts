/**
 * Deployment-shape checks: every app boots under the production CSP, and the
 * routing that vercel.json defines actually resolves.
 *
 * These need no wallet and no funds, so they run fastest and fail earliest.
 */

import { expect, test } from "../src/fixtures.js";

const APPS = [
  { path: "/", title: "CCIP SDK Examples", heading: "CCIP SDK Examples" },
  { path: "/02-evm-simple-bridge/", title: "CCIP Simple Bridge", heading: "CCIP Simple Bridge" },
  {
    path: "/03-multichain-bridge-dapp/",
    title: "Multichain Family Bridge",
    heading: "Multichain Family Bridge",
  },
];

for (const app of APPS) {
  test(`${app.path} boots with no unexpected console errors`, async ({ page, consoleLog }) => {
    await page.goto(app.path);
    await expect(page).toHaveTitle(app.title);
    await expect(page.getByRole("heading", { name: app.heading, level: 1 })).toBeVisible();

    // Anything not on the documented known-issues list is a regression.
    expect(consoleLog.unexpectedErrors(), "unexpected console errors").toEqual([]);
  });
}

test("production security headers are served", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};

  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toContain("max-age=");
});

test("SPA deep links resolve through the vercel.json rewrites", async ({ page }) => {
  // A path with no file behind it: only the rewrite can serve this.
  const response = await page.goto("/02-evm-simple-bridge/some/client/route");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "CCIP Simple Bridge", level: 1 })).toBeVisible();
});

test("the Google Analytics beacon is gone, not merely CSP-blocked", async ({ page }) => {
  // disableTelemetry on AptosWalletAdapterProvider stops the request being made
  // at all. Asserting on the request rather than the console distinguishes that
  // from the CSP blocking a request the adapter still attempted.
  const analyticsRequests: string[] = [];
  page.on("request", (req) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(req.url())) {
      analyticsRequests.push(req.url());
    }
  });

  await page.goto("/03-multichain-bridge-dapp/");
  await page.waitForTimeout(2_000); // let deferred adapter init settle

  expect(analyticsRequests, "third-party analytics must not be requested").toEqual([]);
});

test("no remote font is fetched", async ({ page }) => {
  const fontRequests: string[] = [];
  page.on("request", (req) => {
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(req.url())) fontRequests.push(req.url());
  });

  await page.goto("/03-multichain-bridge-dapp/");
  await page.waitForTimeout(2_000);

  expect(fontRequests, "remote fonts must not be requested").toEqual([]);
});
