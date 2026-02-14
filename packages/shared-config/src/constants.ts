/**
 * Centralized constants for CCIP SDK examples
 *
 * This module exports common URLs and constants used across all examples.
 * Centralizing these prevents duplication and makes updates easier.
 */

/**
 * External documentation and resource URLs
 */
export const EXTERNAL_URLS = {
  /** CCIP Documentation */
  docs: "https://docs.chain.link/ccip",

  /** CCIP Explorer - message tracking */
  ccipExplorer: "https://ccip.chain.link",

  /** Chainlink Faucets for test tokens */
  faucets: "https://faucets.chain.link",

  /** GitHub repository */
  github: "https://github.com/smartcontractkit/ccip",
} as const;

/**
 * Get faucet URL for a specific network
 *
 * @param networkId - SDK-compatible network ID (e.g., "ethereum-testnet-sepolia")
 * @returns Full URL to the faucet for that network
 */
export function getFaucetUrl(networkId: string): string {
  // Map networkIds to faucet paths
  const faucetPaths: Record<string, string> = {
    "ethereum-testnet-sepolia": "sepolia",
    "ethereum-testnet-sepolia-base-1": "base-sepolia",
    "avalanche-testnet-fuji": "fuji",
    "solana-devnet": "solana-devnet",
  };

  const path = faucetPaths[networkId];
  if (!path) return EXTERNAL_URLS.faucets;

  return `${EXTERNAL_URLS.faucets}/${path}`;
}

/**
 * CCIP Message lifecycle stages
 *
 * A CCIP message goes through these stages:
 * 1. SENT - Transaction submitted on source chain
 * 2. SOURCE_FINALIZED - Source chain reached finality
 * 3. COMMITTED - Merkle root committed by DON to destination
 * 4. BLESSED - Risk Management Network approved
 * 5. EXECUTED (SUCCESS/FAILED) - Message executed on destination
 */
export const MESSAGE_STAGES = [
  {
    id: "submitted",
    label: "Submitted",
    description: "Transaction submitted on source chain",
  },
  {
    id: "finalized",
    label: "Finalized",
    description: "Source chain reached finality",
  },
  {
    id: "committed",
    label: "Committed",
    description: "Merkle root committed by DON",
  },
  {
    id: "blessed",
    label: "Blessed",
    description: "Risk Management approved",
  },
  {
    id: "executed",
    label: "Executed",
    description: "Message executed on destination",
  },
] as const;

/**
 * Map SDK status to stage index (0-4)
 */
export function getStageFromStatus(status: string): number {
  switch (status) {
    case "SENT":
      return 0;
    case "SOURCE_FINALIZED":
      return 1;
    case "COMMITTED":
    case "BLESSED":
    case "VERIFYING":
    case "VERIFIED":
      return 2;
    case "SUCCESS":
      return 4;
    case "FAILED":
      return 4; // Same stage, different styling
    default:
      return 0;
  }
}

/**
 * Polling configuration for message status
 */
export const POLLING_CONFIG = {
  /** Initial delay between polls (ms) */
  initialDelay: 10_000,
  /** Maximum delay between polls (ms) */
  maxDelay: 30_000,
  /** Delay increment per poll (ms) */
  delayIncrement: 5_000,
  /** Maximum polling duration before timeout (ms) - 35 minutes */
  timeout: 35 * 60 * 1000,
  /** Maximum retries for "message not found" errors */
  maxNotFoundRetries: 20,
} as const;

/**
 * Status descriptions for CCIP message states
 *
 * Maps SDK status values to human-readable descriptions.
 * Use getStatusDescription() to safely retrieve descriptions.
 */
export const STATUS_DESCRIPTIONS: Record<string, string> = {
  SENT: "Transaction submitted on source chain, waiting for finality",
  SOURCE_FINALIZED: "Source chain reached finality, DON processing",
  COMMITTED: "DON committed merkle root to destination chain",
  BLESSED: "Risk Management Network approved the message",
  VERIFYING: "Message being verified on destination chain",
  VERIFIED: "Message verified, ready for execution",
  SUCCESS: "Message executed successfully on destination",
  FAILED: "Message execution failed (may be retryable)",
  UNKNOWN: "Status unknown or message not found",
} as const;

/**
 * Get status description with fallback
 */
export function getStatusDescription(status: string): string {
  return STATUS_DESCRIPTIONS[status] ?? "Status unknown or message not found";
}

/**
 * Dummy addresses for fee estimation
 *
 * These are used when estimating fees without a real receiver address.
 * The addresses are valid but not owned by anyone.
 */
export const DUMMY_ADDRESSES = {
  /** Dummy EVM address for fee estimation */
  evm: "0x0000000000000000000000000000000000000001",
  /** Dummy Solana address (System Program) for fee estimation */
  solana: "11111111111111111111111111111111",
} as const;
