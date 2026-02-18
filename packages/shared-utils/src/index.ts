/**
 * @ccip-examples/shared-utils
 *
 * Shared utilities for CCIP SDK examples.
 */

// Error handling exports
export { getErrorMessage } from "./errors.js";

// Retry utilities
export { withRetry, type RetryConfig, DEFAULT_RETRY_CONFIG } from "./retry.js";

// Validation exports
export {
  isValidEVMAddress,
  isValidSolanaAddress,
  isValidAddress,
  checksumAddress,
  isValidAmount,
  isAmountWithinBalance,
  parseAmount,
  formatAmount,
  truncateAddress,
} from "./validation.js";

// Viem utilities for CCIP SDK integration
export { toGenericPublicClient } from "./viem.js";

// CCIP message building utilities
export { buildTokenTransferMessage } from "./message.js";

// Chain factory utilities
export { createChain, createLogger } from "./chain.js";

// NOTE: Wallet utilities (createWallet, createSolanaWallet, etc.) use Node.js
// built-ins (fs, os, path) and are NOT re-exported here to keep the main
// entry point browser-safe. Import them from "@ccip-examples/shared-utils/wallet".
