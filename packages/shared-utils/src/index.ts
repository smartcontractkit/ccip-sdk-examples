/**
 * @ccip-examples/shared-utils
 *
 * Shared utilities for CCIP SDK examples.
 */

// Error handling exports
export { getErrorMessage } from "./errors.js";

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
