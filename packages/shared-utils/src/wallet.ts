/**
 * Wallet Factory Utilities
 *
 * Provides helpers for creating wallet / signer instances from
 * private key material in various formats. Lives in shared-utils
 * so every example can reuse the same logic.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";
import { Keypair } from "@solana/web3.js";
import { Wallet as AnchorWallet } from "@coral-xyz/anchor";
import { type ChainFamily, ChainFamily as CF } from "@chainlink/ccip-sdk";
import bs58 from "bs58";
import { ethers, getBytes, hexlify } from "ethers";

// ---------------------------------------------------------------------------
// Private key environment variable resolution
// ---------------------------------------------------------------------------

/**
 * Maps each chain family to its env var name for the private key.
 *
 * Using family-prefixed env vars (e.g. `EVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY`)
 * allows a single `.env` file to hold keys for every chain family at once.
 */
const PRIVATE_KEY_ENV_VARS: Partial<Record<ChainFamily, string>> = {
  [CF.EVM]: "EVM_PRIVATE_KEY",
  [CF.Solana]: "SVM_PRIVATE_KEY",
};

/**
 * Read the private key from the environment for a given chain family.
 *
 * @param family - Chain family to look up
 * @returns The raw env var value (file path, hex, or base58)
 * @throws If no env var is mapped for the family, or if it is unset
 */
export function getPrivateKeyForFamily(family: ChainFamily): string {
  const envVar = PRIVATE_KEY_ENV_VARS[family];
  if (!envVar) {
    throw new Error(`No private key env var configured for chain family "${family}".`);
  }

  const value = process.env[envVar];
  if (!value) {
    throw new Error(`${envVar} is not set in .env file.\n` + `See .env.example for instructions.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Solana wallet
// ---------------------------------------------------------------------------

/**
 * Expand a leading `~` to the user's home directory.
 */
function expandHome(filePath: string): string {
  if (filePath.startsWith("~")) {
    return resolve(homedir(), filePath.slice(2)); // skip "~/"
  }
  return filePath;
}

/**
 * Create a Solana {@link AnchorWallet} from flexible key material.
 *
 * Accepts any of the following formats (tried in order):
 *
 * 1. **File path** — a JSON byte-array file produced by `solana-keygen`.
 *    Supports `~` for home directory.
 *    ```
 *    ~/.config/solana/id.json
 *    /absolute/path/to/keypair.json
 *    ```
 *
 * 2. **Hex string** — `0x`-prefixed 64-byte secret key.
 *
 * 3. **Base58 string** — standard Solana secret key encoding.
 *
 * This mirrors the approach used in
 * [ccip-cli](https://github.com/smartcontractkit/ccip-tools-ts)
 * and the [solana-starter-kit](https://github.com/smartcontractkit/solana-starter-kit).
 *
 * @param keyOrPath - File path, hex string, or base58 string
 * @returns An Anchor Wallet ready for use with the CCIP SDK's `sendMessage`
 *
 * @example
 * ```typescript
 * // From keypair file (recommended)
 * const wallet = createSolanaWallet("~/.config/solana/devnet.json");
 *
 * // From base58 secret key
 * const wallet = createSolanaWallet("4wBqpZM9k...");
 *
 * console.log("Address:", wallet.publicKey.toBase58());
 * ```
 */
export function createSolanaWallet(keyOrPath: string): AnchorWallet {
  let secretKeyBytes: Uint8Array;

  // 1. Try as a file path first
  const expanded = expandHome(keyOrPath);
  if (existsSync(expanded)) {
    const raw = readFileSync(expanded, "utf-8");
    const bytes = JSON.parse(raw) as number[];
    secretKeyBytes = getBytes(hexlify(new Uint8Array(bytes)));
  } else if (keyOrPath.startsWith("0x")) {
    // 2. Hex-encoded secret key
    secretKeyBytes = getBytes(keyOrPath);
  } else {
    // 3. Base58-encoded secret key
    try {
      secretKeyBytes = bs58.decode(keyOrPath);
    } catch {
      throw new Error(
        "Invalid Solana private key. Expected one of:\n" +
          "  - A path to a keypair JSON file (e.g. ~/.config/solana/id.json)\n" +
          "  - A 0x-prefixed hex secret key\n" +
          "  - A base58 encoded secret key"
      );
    }
  }

  return new AnchorWallet(Keypair.fromSecretKey(secretKeyBytes));
}

// ---------------------------------------------------------------------------
// EVM wallet
// ---------------------------------------------------------------------------

/**
 * Create an EVM ethers {@link ethers.Wallet} from a hex private key.
 *
 * @param privateKey - Hex private key (with or without `0x` prefix)
 * @param rpcUrl - RPC endpoint to attach the wallet to
 * @returns An ethers Wallet (implements Signer) for use with the CCIP SDK
 */
export function createEVMWallet(privateKey: string, rpcUrl: string): ethers.Wallet {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

// ---------------------------------------------------------------------------
// Unified wallet factory
// ---------------------------------------------------------------------------

/**
 * Create a wallet/signer for the given chain family.
 *
 * Key resolution order:
 * 1. If `keyOverride` is provided (e.g. from a CLI `--keypair` flag), use it.
 * 2. Otherwise read from the family's env var (`EVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY`, …).
 *
 * @param family - Source chain family
 * @param rpcUrl - RPC URL (needed by EVM to attach a provider)
 * @param keyOverride - Optional key material that takes precedence over the env var.
 *   For Solana this can be a keypair file path, hex, or base58 string.
 *   For EVM this is a hex private key.
 * @returns `{ wallet, address }` — wallet is `unknown` because each
 *   family has its own type; the SDK validates internally.
 *
 * @example
 * ```typescript
 * // From env var (default)
 * const { wallet, address } = createWallet(ChainFamily.EVM, rpcUrl);
 *
 * // CLI override wins over env var
 * const { wallet, address } = createWallet(ChainFamily.Solana, rpcUrl, "~/.config/solana/devnet.json");
 * ```
 */
export function createWallet(
  family: ChainFamily,
  rpcUrl: string,
  keyOverride?: string
): { wallet: unknown; address: string } {
  const privateKey = keyOverride ?? getPrivateKeyForFamily(family);

  switch (family) {
    case CF.Solana: {
      const wallet = createSolanaWallet(privateKey);
      return { wallet, address: wallet.publicKey.toBase58() };
    }
    case CF.EVM: {
      const wallet = createEVMWallet(privateKey, rpcUrl);
      return { wallet, address: wallet.address };
    }
    default:
      throw new Error(`Wallet creation for "${family}" is not yet supported in this example`);
  }
}
