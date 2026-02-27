/**
 * Canonical transfer status and state types for CCIP examples.
 * Single source of truth to avoid name collisions with TransferStatus component.
 */

import type { CategorizedError } from "../errorCategorization.js";

/** Transfer lifecycle status (avoids shadowing component name TransferStatus) */
export type TransferStatusStatus = "idle" | "estimating" | "sending" | "success" | "failed";

/** Context of the last successful transfer for live balance/rate-limit views */
export interface LastTransferContext {
  sourceNetworkId: string;
  destNetworkId: string;
  tokenAddress: string;
  receiverAddress: string;
  senderAddress: string;
  /** Token decimals on the source chain */
  tokenDecimals: number;
  /** Token decimals on the destination chain (may differ, e.g. 9 on Solana vs 18 on EVM) */
  destTokenDecimals: number;
  /** Captured before executeTransfer for "before vs after" display */
  initialSourceBalance?: bigint | null;
  /** Captured before executeTransfer for "before vs after" display */
  initialDestBalance?: bigint | null;
}

/** Transfer state including transaction details */
export interface TransferState {
  status: TransferStatusStatus;
  error: string | null;
  txHash: string | null;
  messageId: string | null;
  fee: bigint | null;
  feeFormatted: string | null;
  /** Estimated delivery time from getLaneLatency (e.g. "~17 min") */
  estimatedTime: string | null;
  /** When set, UI can show ErrorMessage component with recovery and severity */
  categorizedError?: CategorizedError | null;
  /** Set on successful send so TransferBalances / TransferRateLimits can be wired */
  lastTransferContext?: LastTransferContext | null;
}
