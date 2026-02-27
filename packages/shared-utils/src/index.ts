/**
 * @ccip-examples/shared-utils
 *
 * Shared utilities for CCIP SDK examples.
 */

// Error handling exports
export { getErrorMessage } from "./errors.js";

// Error categorization (for ErrorMessage UX)
export {
  categorizeError,
  isWalletRejection,
  isRecoverableError,
  type ErrorCategory,
  type ErrorSeverity,
  type CategorizedError,
} from "./errorCategorization.js";

// CCIP error parsing (browser-safe)
export {
  parseEVMError,
  parseSolanaError,
  parseAptosError,
  parseCCIPError,
  getCCIPErrorMessage,
  CCIP_ERROR_MESSAGES,
  type ParsedCCIPError,
} from "./ccipErrors.js";

// Formatting (no React)
export { formatLatency, formatElapsedTime, formatRelativeTime } from "./formatting.js";
export { copyToClipboard, COPIED_FEEDBACK_MS } from "./clipboard.js";

// Validation exports
export {
  isValidEVMAddress,
  isValidSolanaAddress,
  isValidAptosAddress,
  isValidAddress,
  checksumAddress,
  isValidAmount,
  isAmountWithinBalance,
  parseAmount,
  formatAmount,
  formatAmountFull,
  truncateAddress,
} from "./validation.js";

// Rate limit formatting (pool capacity display)
export {
  formatRateLimitBucket,
  type RateLimitBucket,
  type FormatRateLimitBucketResult,
} from "./rateLimit.js";

// Viem utilities for CCIP SDK integration
export { toGenericPublicClient } from "./viem.js";

// CCIP message building utilities
export { buildTokenTransferMessage } from "./message.js";

// Chain factory utilities
export { createChain, createLogger } from "./chain.js";

// Chain types and type guards (EVM / Solana)
export { type ChainInstance, isEVMChain, isSolanaChain, isAptosChain } from "./chainTypes.js";

// Wallet address resolution (browser-safe, family-agnostic)
export { getWalletAddress, getAddressPlaceholder, type WalletAddresses } from "./walletAddress.js";

// Transfer status and state (canonical types for useTransfer / TransferStatus component)
export {
  type LastTransferContext,
  type TransferStatusStatus,
  type TransferState,
} from "./types/transfer.js";

// NOTE: Wallet utilities (createWallet, createSolanaWallet, etc.) use Node.js
// built-ins (fs, os, path) and are NOT re-exported here to keep the main
// entry point browser-safe. Import them from "@ccip-examples/shared-utils/wallet".
