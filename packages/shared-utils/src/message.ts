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
 * @param receiver - Destination address in the format appropriate for the dest chain
 * @param tokenAddress - Source token address to transfer
 * @param amount - Amount in the token's smallest unit (e.g. wei for 18-decimal tokens)
 * @param feeToken - Optional fee token address. When omitted, fee is paid in native
 *   currency (ETH, SOL, etc.). When provided, fee is paid in the specified token
 *   (e.g. LINK).
 *
 * @example
 * ```typescript
 * // Pay fee in native currency
 * const message = buildTokenTransferMessage({
 *   receiver: '0x123...',
 *   tokenAddress: '0xabc...',
 *   amount: parseAmount('10', tokenDecimals),
 * });
 *
 * // Pay fee in LINK
 * const message = buildTokenTransferMessage({
 *   receiver: '0x123...',
 *   tokenAddress: '0xabc...',
 *   amount: parseAmount('10', tokenDecimals),
 *   feeToken: '0xLinkAddress...',
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
  feeToken,
}: {
  receiver: string;
  tokenAddress: string;
  amount: bigint;
  feeToken?: string;
}): MessageInput {
  return {
    receiver,
    tokenAmounts: [{ token: tokenAddress, amount }],
    ...(feeToken && { feeToken }),
  };
}
