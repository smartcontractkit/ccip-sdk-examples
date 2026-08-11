/**
 * A Phantom-shaped Solana provider for the browser.
 *
 * `@solana/wallet-adapter-phantom` detects the legacy global
 * (`window.phantom?.solana?.isPhantom`), reads `publicKey.toBytes()`, and sends
 * through `signAndSendTransaction`, so a plain object is enough. No extension.
 *
 * The keypair stays in Node behind a Playwright binding: the page serialises the
 * transaction, Node signs and submits it, and only the signature comes back.
 *
 * Submitting is refused unless CCIP_E2E_ALLOW_SEND=1, matching the EVM wallet.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { Page } from "@playwright/test";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";

const BINDING = "__ccipE2eSolanaSend";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decodes a base58 address to its bytes. */
export function base58Decode(value: string): number[] {
  const bytes: number[] = [0];
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = index;
    for (let i = 0; i < bytes.length; i++) {
      carry += (bytes[i] ?? 0) * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return bytes.reverse();
}

/** The path `solana-keygen` writes by default. */
export const DEFAULT_KEYPAIR_PATH = "~/.config/solana/id.json";

function expandHome(path: string): string {
  return path.startsWith("~") ? resolve(homedir(), path.slice(2)) : resolve(path);
}

/** Reads a keypair from a `solana-keygen` JSON file. */
export function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(readFileSync(expandHome(path), "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export interface SolanaWalletOptions {
  /** Path to a keypair JSON. Defaults to SVM_PRIVATE_KEY, then the standard path. */
  keypairPath?: string;
  rpcUrl?: string;
  /** Permit submitting transactions. Off unless CCIP_E2E_ALLOW_SEND=1. */
  allowSend?: boolean;
}

export class SolanaTestWallet {
  readonly address: string;
  private readonly keypair: Keypair;
  private readonly connection: Connection;
  private readonly allowSend: boolean;
  /** Signatures this wallet submitted, so a spec can assert on spend. */
  readonly sentTransactions: string[] = [];

  constructor(options: SolanaWalletOptions = {}) {
    const path = options.keypairPath ?? process.env.SVM_PRIVATE_KEY ?? DEFAULT_KEYPAIR_PATH;
    this.keypair = loadKeypair(path);
    this.address = this.keypair.publicKey.toBase58();
    this.connection = new Connection(
      options.rpcUrl ?? process.env.RPC_SOLANA_DEVNET ?? "https://api.devnet.solana.com",
      "confirmed"
    );
    this.allowSend = options.allowSend ?? process.env.CCIP_E2E_ALLOW_SEND === "1";
  }

  /** Signs and submits a serialised transaction, returning its signature. */
  private async signAndSend(base64: string): Promise<string> {
    if (!this.allowSend) {
      throw new Error(
        "Solana submission blocked. This wallet holds real devnet funds; " +
          "set CCIP_E2E_ALLOW_SEND=1 to permit spending."
      );
    }
    const tx = VersionedTransaction.deserialize(Buffer.from(base64, "base64"));
    tx.sign([this.keypair]);
    const signature = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });
    this.sentTransactions.push(signature);
    return signature;
  }

  /** Installs the provider. Call before `page.goto`. */
  async install(page: Page): Promise<void> {
    const keyBytes = base58Decode(this.address);

    await page.exposeFunction(BINDING, (base64: string) => this.signAndSend(base64));

    await page.addInitScript(
      ({ address, bytes, binding }) => {
        type Listener = (payload: unknown) => void;
        const listeners = new Map<string, Set<Listener>>();

        const publicKey = {
          toBytes: () => Uint8Array.from(bytes),
          toBuffer: () => Uint8Array.from(bytes),
          toBase58: () => address,
          toString: () => address,
        };

        const toBase64 = (raw: Uint8Array) => {
          let binary = "";
          for (const byte of raw) binary += String.fromCharCode(byte);
          return btoa(binary);
        };

        const send = (tx: { serialize: () => Uint8Array }) =>
          (window as unknown as Record<string, (b64: string) => Promise<string>>)[binding]?.(
            toBase64(tx.serialize())
          );

        const solana = {
          isPhantom: true,
          isConnected: false,
          publicKey: null as typeof publicKey | null,

          connect: () => {
            solana.isConnected = true;
            solana.publicKey = publicKey;
            return Promise.resolve({ publicKey });
          },
          disconnect: () => {
            solana.isConnected = false;
            solana.publicKey = null;
            for (const fn of listeners.get("disconnect") ?? []) fn(undefined);
            return Promise.resolve();
          },

          // The adapter's sendTransaction path.
          signAndSendTransaction: async (tx: { serialize: () => Uint8Array }) => ({
            signature: await send(tx),
            publicKey: address,
          }),

          // Signing without submitting would need the signed bytes back in the
          // page; nothing in these apps takes that path.
          signTransaction: () =>
            Promise.reject(new Error("Use signAndSendTransaction in this test wallet")),
          signAllTransactions: () =>
            Promise.reject(new Error("Use signAndSendTransaction in this test wallet")),
          signMessage: () =>
            Promise.reject(new Error("Message signing is not available in this test wallet")),

          on: (event: string, fn: Listener) => {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)?.add(fn);
          },
          off: (event: string, fn: Listener) => listeners.get(event)?.delete(fn),
          removeListener: (event: string, fn: Listener) => listeners.get(event)?.delete(fn),
          removeAllListeners: () => listeners.clear(),
        };

        Object.defineProperty(window, "phantom", {
          value: { solana },
          writable: false,
          configurable: true,
        });
        Object.defineProperty(window, "solana", {
          value: solana,
          writable: false,
          configurable: true,
        });
      },
      { address: this.address, bytes: keyBytes, binding: BINDING }
    );
  }
}
