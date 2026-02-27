/**
 * Solana transaction utilities.
 *
 * Reusable helpers for sending and confirming Solana transactions
 * with robust handling of blockhash expiration.
 */

import { type TransactionSignature, type Commitment } from "@solana/web3.js";

/* ─── Types ──────────────────────────────────────────────────────── */

/**
 * Minimal interface for the Solana Connection methods we need.
 * Using a structural type instead of the concrete Connection class
 * avoids version-mismatch errors across workspace packages.
 */
export interface SolanaConnectionLike {
  getSignatureStatus(signature: TransactionSignature): Promise<{
    value: { confirmationStatus?: string; err: unknown } | null;
  }>;
  getBlockHeight(commitment?: Commitment): Promise<number>;
}

export interface ConfirmTransactionOptions {
  /** Solana RPC connection (or any object matching SolanaConnectionLike). */
  connection: SolanaConnectionLike;
  /** Transaction signature (base-58 hash) returned by sendTransaction. */
  signature: TransactionSignature;
  /** Block height after which the transaction is considered expired. */
  lastValidBlockHeight: number;
  /** Commitment level to check against. @default "confirmed" */
  commitment?: Commitment;
  /** Milliseconds between each poll. @default 2000 */
  pollIntervalMs?: number;
  /** Maximum total time (ms) before giving up. @default 60000 */
  timeoutMs?: number;
}

export interface ConfirmTransactionResult {
  /** Whether the transaction was confirmed on-chain. */
  confirmed: boolean;
  /** If confirmed, whether it succeeded (no on-chain error). */
  success: boolean;
}

/* ─── Implementation ─────────────────────────────────────────────── */

/**
 * Poll-based transaction confirmation for Solana.
 *
 * Unlike `connection.confirmTransaction()`, this approach does **not** require
 * a blockhash, avoiding the common "block height exceeded" failure when the
 * blockhash used for confirmation is stale.
 *
 * The loop polls `getSignatureStatus()` until one of:
 * - The signature reaches the desired commitment level → **confirmed**
 * - The current block height exceeds `lastValidBlockHeight` → **expired**
 * - The timeout is reached → throws
 *
 * @example
 * ```ts
 * const { blockhash, lastValidBlockHeight } =
 *   await connection.getLatestBlockhash("confirmed");
 * // … build, sign, send transaction …
 * const result = await confirmTransaction({
 *   connection,
 *   signature,
 *   lastValidBlockHeight,
 * });
 * if (!result.confirmed) throw new Error("Transaction expired");
 * if (!result.success) throw new Error("Transaction failed on-chain");
 * ```
 */
export async function confirmTransaction(
  opts: ConfirmTransactionOptions
): Promise<ConfirmTransactionResult> {
  const {
    connection,
    signature,
    lastValidBlockHeight,
    commitment = "confirmed",
    pollIntervalMs = 2_000,
    timeoutMs = 60_000,
  } = opts;

  const DESIRED_LEVELS: string[] =
    commitment === "finalized" ? ["finalized"] : ["confirmed", "finalized"];

  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // 1. Check signature status (no blockhash needed)
    const { value } = await connection.getSignatureStatus(signature);

    if (value?.confirmationStatus && DESIRED_LEVELS.includes(value.confirmationStatus)) {
      return { confirmed: true, success: value.err === null };
    }

    // 2. Check if the transaction's block height window has passed
    const currentBlockHeight = await connection.getBlockHeight(commitment);
    if (currentBlockHeight > lastValidBlockHeight) {
      return { confirmed: false, success: false };
    }

    // 3. Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Transaction confirmation timed out after ${timeoutMs}ms (signature: ${signature})`
  );
}
