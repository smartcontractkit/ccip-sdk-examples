/**
 * An AIP-62 Aptos wallet for the browser.
 *
 * `@aptos-labs/wallet-adapter-core` discovers wallets through the wallet
 * standard registry rather than a `window.aptos` global, which Petra itself no
 * longer provides, so this registers via `wallet-standard:register-wallet` and
 * implements the eight features the adapter requires.
 *
 * Signing happens in Node behind a Playwright binding. The adapter submits
 * through its own Aptos client, so this wallet only signs; the authenticator
 * crosses the binding as BCS bytes because the page cannot construct SDK classes.
 *
 * Signing is refused unless CCIP_E2E_ALLOW_SEND=1.
 */

import { readFileSync } from "node:fs";

import {
  Account,
  Aptos,
  AptosConfig,
  Deserializer,
  Ed25519PrivateKey,
  Network,
  PrivateKey,
  PrivateKeyVariants,
  SimpleTransaction,
} from "@aptos-labs/ts-sdk";
import type { Page } from "@playwright/test";

const BINDING = "__ccipE2eAptosSign";

export interface AptosWalletOptions {
  /** Path to an `aptos init` config.yaml. */
  configPath?: string;
  /** Profile inside that config. */
  profile?: string;
  /** Raw key, used instead of a config file. */
  privateKey?: string;
  allowSend?: boolean;
}

/** Reads one profile's private key out of an `aptos init` config. */
export function readProfileKey(configPath: string, profile: string): string {
  const text = readFileSync(configPath, "utf8");
  const section = text.split(new RegExp(`^\\s{2}${profile}:$`, "m"))[1];
  if (!section) throw new Error(`Profile ${profile} not found in ${configPath}`);
  const match = /private_key:\s*"?([^"\n]+)"?/.exec(section);
  if (!match?.[1]) throw new Error(`No private_key for profile ${profile}`);
  return match[1].trim();
}

export class AptosTestWallet {
  readonly address: string;
  private readonly account: Account;
  private readonly aptos: Aptos;
  private readonly allowSend: boolean;
  /** Sequence number of every transaction this wallet signed, so a spec can assert one was signed. */
  readonly signedTransactions: string[] = [];

  constructor(options: AptosWalletOptions = {}) {
    const raw =
      options.privateKey ??
      (options.configPath
        ? readProfileKey(options.configPath, options.profile ?? "default")
        : process.env.APTOS_PRIVATE_KEY);
    if (!raw)
      throw new Error("No Aptos key: pass privateKey or configPath, or set APTOS_PRIVATE_KEY");

    // Accepts both the AIP-80 "ed25519-priv-0x..." form and a bare hex key.
    const formatted = PrivateKey.formatPrivateKey(raw, PrivateKeyVariants.Ed25519);
    this.account = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(formatted) });
    this.address = this.account.accountAddress.toString();
    this.aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
    this.allowSend = options.allowSend ?? process.env.CCIP_E2E_ALLOW_SEND === "1";
  }

  /**
   * Signs a BCS-serialised SimpleTransaction and returns the resulting
   * AccountAuthenticator, itself BCS-serialised.
   *
   * The adapter submits through its own Aptos client, so the wallet only signs.
   * The authenticator crosses the binding as bytes because the page cannot
   * construct SDK classes.
   */
  private signSerialized(base64: string): string {
    if (!this.allowSend) {
      throw new Error(
        "Aptos signing blocked. This wallet holds real testnet funds; " +
          "set CCIP_E2E_ALLOW_SEND=1 to permit spending."
      );
    }
    const transaction = SimpleTransaction.deserialize(
      new Deserializer(Buffer.from(base64, "base64"))
    );
    const senderAuthenticator = this.aptos.transaction.sign({
      signer: this.account,
      transaction,
    });
    this.signedTransactions.push(transaction.rawTransaction.sequence_number.toString());
    return Buffer.from(senderAuthenticator.bcsToBytes()).toString("base64");
  }

  /** Registers the wallet. Call before `page.goto`. */
  async install(page: Page): Promise<void> {
    await page.exposeFunction(BINDING, (base64: string) => this.signSerialized(base64));

    await page.addInitScript(
      ({ address, binding }) => {
        const account = {
          address: { toString: () => address, toStringLong: () => address },
          publicKey: { toString: () => address },
          ansName: undefined,
        };

        const toBase64 = (raw: Uint8Array) => {
          let binary = "";
          for (const byte of raw) binary += String.fromCharCode(byte);
          return btoa(binary);
        };

        const rejectSigning = () =>
          Promise.reject(new Error("Use submitTransaction in this test wallet"));

        const wallet = {
          version: "1.0.0",
          name: "E2E Test Wallet",
          icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
          url: "https://chain.link",
          chains: ["aptos:testnet"],
          accounts: [account],

          features: {
            "aptos:account": { version: "1.0.0", account: () => Promise.resolve(account) },
            "aptos:connect": {
              version: "1.0.0",
              connect: () => Promise.resolve({ status: "Approved", args: account }),
            },
            "aptos:disconnect": { version: "1.0.0", disconnect: () => Promise.resolve() },
            "aptos:network": {
              version: "1.0.0",
              network: () => Promise.resolve({ name: "testnet", chainId: 2 }),
            },
            "aptos:onAccountChange": { version: "1.0.0", onAccountChange: () => Promise.resolve() },
            "aptos:onNetworkChange": { version: "1.0.0", onNetworkChange: () => Promise.resolve() },
            "aptos:signMessage": { version: "1.0.0", signMessage: rejectSigning },
            // The adapter submits through its own client and only needs the
            // authenticator back. It is reconstructed here as an object exposing
            // bcsToBytes, which is the sole method the submit path calls on it,
            // because the page cannot instantiate the SDK's AccountAuthenticator.
            "aptos:signTransaction": {
              version: "1.0.0",
              signTransaction: async (transaction: { bcsToBytes: () => Uint8Array }) => {
                const b64 = await (
                  window as unknown as Record<string, (t: string) => Promise<string>>
                )[binding]?.(toBase64(transaction.bcsToBytes()));
                const raw = Uint8Array.from(atob(b64 ?? ""), (c) => c.charCodeAt(0));
                return { status: "Approved", args: { bcsToBytes: () => raw } };
              },
            },
          },
        };

        const announce = () => {
          window.dispatchEvent(
            new CustomEvent("wallet-standard:register-wallet", {
              detail: (api: { register: (w: unknown) => void }) => {
                api.register(wallet);
              },
            })
          );
        };
        window.addEventListener("wallet-standard:app-ready", (event) => {
          const api = (event as CustomEvent<{ register: (w: unknown) => void }>).detail;
          api.register(wallet);
        });
        announce();
      },
      { address: this.address, binding: BINDING }
    );
  }
}
