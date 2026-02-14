/**
 * CCIP Message Building Utilities
 *
 * Shared message building functions for CCIP SDK examples.
 * Ensures consistency between fee estimation and message sending.
 */

import type { MessageInput } from "@chainlink/ccip-sdk";

/**
 * Build a CCIP message for token transfers
 *
 * Returns a MessageInput object that can be used with SDK methods
 * like getFee() and sendMessage().
 *
 * @example
 * ```typescript
 * const message = buildTokenTransferMessage({
 *   receiver: '0x123...',
 *   tokenAddress: '0xabc...',
 *   amount: parseAmount('10', tokenDecimals),
 * });
 *
 * // Use for fee estimation
 * const fee = await chain.getFee({ router, destChainSelector, message });
 *
 * // Use for sending (with fee added)
 * await chain.sendMessage({
 *   router, destChainSelector,
 *   message: { ...message, fee },
 *   wallet,
 * });
 * ```
 */
export function buildTokenTransferMessage({
  receiver,
  tokenAddress,
  amount,
}: {
  receiver: string;
  tokenAddress: string;
  amount: bigint;
}): MessageInput {
  return {
    receiver,
    tokenAmounts: [{ token: tokenAddress, amount }],
  };
}
