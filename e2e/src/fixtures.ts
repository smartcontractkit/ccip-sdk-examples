/**
 * Shared Playwright fixtures: an injected EVM wallet and a console recorder.
 */

import { test as base, type ConsoleMessage, type Page } from "@playwright/test";
import type { Hex } from "viem";
import { sepolia } from "viem/chains";

import { AptosTestWallet } from "./wallet/aptos.js";
import { EvmTestWallet } from "./wallet/evm.js";
import { SolanaTestWallet } from "./wallet/solana.js";

export interface ConsoleRecorder {
  errors: string[];
  warnings: string[];
  /** Errors with the known-and-accepted ones filtered out. */
  unexpectedErrors: () => string[];
}

/**
 * Console errors that are accepted, each with the reason it is accepted.
 *
 * The suite asserts that nothing outside this list appears, so a new error is a
 * test failure rather than a line someone has to notice in a log.
 */
export const KNOWN_CONSOLE_ERRORS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /pulse\.walletconnect\.org|api\.web3modal\.org|Reown Config/i,
    why: "No VITE_WALLETCONNECT_PROJECT_ID set, so the config request is rejected. Set one and these stop; injected wallets are unaffected either way.",
  },
  {
    pattern: /fonts\.googleapis\.com/i,
    why: "Fixed at the source; the entry stays as a regression guard (site.spec.ts asserts no remote font is requested).",
  },
  {
    pattern: /googletagmanager\.com/i,
    why: "Fixed at the source; the entry stays as a regression guard (site.spec.ts asserts the beacon is never requested).",
  },
];

function attachConsoleRecorder(page: Page): ConsoleRecorder {
  const errors: string[] = [];
  const warnings: string[] = [];

  // The URL is appended because "Failed to load resource: the server responded
  // with a status of 400" carries no URL in its text, only in its location. On
  // text alone every failed request looks identical and cannot be attributed.
  const describe = (msg: ConsoleMessage) => {
    const url = msg.location().url;
    return url ? `${msg.text()} @ ${url}` : msg.text();
  };

  const record = (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(describe(msg));
    if (msg.type() === "warning") warnings.push(describe(msg));
  };

  page.on("console", record);
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

  return {
    errors,
    warnings,
    unexpectedErrors: () =>
      errors.filter((e) => !KNOWN_CONSOLE_ERRORS.some(({ pattern }) => pattern.test(e))),
  };
}

interface Fixtures {
  /** A live-testnet EVM wallet already installed on the page. */
  evmWallet: EvmTestWallet;
  /** A receive-only Solana account, for lanes ending on Solana. */
  solanaWallet: SolanaTestWallet;
  /** A receive-only Aptos account, for lanes ending on Aptos. */
  aptosWallet: AptosTestWallet;
  /** Console output for the current page. */
  consoleLog: ConsoleRecorder;
}

export const test = base.extend<Fixtures>({
  consoleLog: async ({ page }, use) => {
    await use(attachConsoleRecorder(page));
  },

  evmWallet: async ({ page }, use) => {
    const key = process.env.CCIP_E2E_PRIVATE_KEY;
    if (!key) {
      throw new Error(
        "CCIP_E2E_PRIVATE_KEY is not set. Copy e2e/.env.example to e2e/.env and add a funded testnet key."
      );
    }

    const rpcUrls: Record<number, string> = {};
    if (process.env.RPC_ETHEREUM_TESTNET_SEPOLIA) {
      rpcUrls[11155111] = process.env.RPC_ETHEREUM_TESTNET_SEPOLIA;
    }
    if (process.env.RPC_ETHEREUM_TESTNET_SEPOLIA_BASE_1) {
      rpcUrls[84532] = process.env.RPC_ETHEREUM_TESTNET_SEPOLIA_BASE_1;
    }

    const wallet = new EvmTestWallet({
      privateKey: key as Hex,
      initialChainId: sepolia.id,
      rpcUrls,
    });

    await wallet.install(page);
    await use(wallet);
  },

  solanaWallet: async ({ page }, use) => {
    const wallet = new SolanaTestWallet({
      ...(process.env.RPC_SOLANA_DEVNET ? { rpcUrl: process.env.RPC_SOLANA_DEVNET } : {}),
    });
    await wallet.install(page);
    await use(wallet);
  },

  aptosWallet: async ({ page }, use) => {
    const configPath = process.env.APTOS_CONFIG_PATH;
    const wallet = new AptosTestWallet({
      ...(configPath ? { configPath, profile: process.env.APTOS_PROFILE ?? "default" } : {}),
    });
    await wallet.install(page);
    await use(wallet);
  },
});

export { expect } from "@playwright/test";
