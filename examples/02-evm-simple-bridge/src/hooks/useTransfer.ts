/**
 * Hook for CCIP token transfers using wagmi/viem
 *
 * Uses the SDK's `sendMessage()` which handles the complete flow:
 * - Token approvals (if needed)
 * - Transaction signing via the wallet client
 * - CCIP message sending
 * - Returns messageId and txHash
 *
 * This is the simplest approach for browser-based transfers.
 *
 * @see https://docs.chain.link/ccip
 */

import { useState, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { viemWallet } from "@chainlink/ccip-sdk/viem";
import { networkInfo, CCIPError } from "@chainlink/ccip-sdk";
import {
  NETWORKS,
  getTokenAddress,
  resolveFeeTokenAddress,
  type FeeTokenOption,
} from "@ccip-examples/shared-config";
import {
  parseAmount,
  formatAmount,
  formatLaneLatency,
  getErrorMessage,
  buildTokenTransferMessage,
} from "@ccip-examples/shared-utils";
import { getChainInstance } from "./useChain.js";

/**
 * Transfer lifecycle states
 *
 * Simplified states since SDK handles the details:
 * - idle: Ready for new transfer
 * - estimating: Calculating CCIP fee + lane latency
 * - sending: SDK is handling approvals and sending (wallet prompts appear)
 * - success: Transfer initiated on source chain
 * - failed: Error occurred
 */
export type TransferStatus = "idle" | "estimating" | "sending" | "success" | "failed";

/**
 * Transfer state including transaction details
 */
export interface TransferState {
  status: TransferStatus;
  error: string | null;
  txHash: string | null;
  messageId: string | null;
  fee: bigint | null;
  feeFormatted: string | null;
  /** Estimated delivery time from getLaneLatency (e.g. "~17 min") */
  estimatedTime: string | null;
}

const initialState: TransferState = {
  status: "idle",
  error: null,
  txHash: null,
  messageId: null,
  fee: null,
  feeFormatted: null,
  estimatedTime: null,
};

export function useTransfer() {
  const [state, setState] = useState<TransferState>(initialState);

  // Wagmi hooks for wallet interaction
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  /**
   * Reset transfer state to initial values
   */
  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  /**
   * Estimate the transfer fee and lane latency without executing.
   *
   * @param sourceNetwork - Source network ID (e.g., "ethereum-testnet-sepolia")
   * @param destNetwork - Destination network ID
   * @param tokenSymbol - Token symbol (e.g., "CCIP-BnM")
   * @param amount - Human-readable amount (e.g., "1.5")
   * @param receiver - Destination address
   * @param feeToken - Fee token option ("native" or "link")
   */
  const estimateFee = useCallback(
    async (
      sourceNetwork: string,
      destNetwork: string,
      tokenSymbol: string,
      amount: string,
      receiver: string,
      feeToken: FeeTokenOption = "native"
    ) => {
      setState((prev) => ({ ...prev, status: "estimating", error: null }));

      try {
        const sourceConfig = NETWORKS[sourceNetwork];
        if (!sourceConfig) {
          throw new Error("Invalid source network configuration");
        }

        const tokenAddress = getTokenAddress(tokenSymbol, sourceNetwork);
        if (!tokenAddress) {
          throw new Error(`Token ${tokenSymbol} not found on ${sourceNetwork}`);
        }

        const sourceChain = await getChainInstance(sourceNetwork);

        // Destination chain selector from static metadata — no RPC needed
        const destChainSelector = networkInfo(destNetwork).chainSelector;

        // Get token decimals from SDK
        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
        const amountWei = parseAmount(amount, tokenInfo.decimals);

        // Resolve fee token address
        const feeTokenAddress = resolveFeeTokenAddress(feeToken, sourceNetwork);

        // Build message using shared utility
        const message = buildTokenTransferMessage({
          receiver,
          tokenAddress,
          amount: amountWei,
          feeToken: feeTokenAddress,
        });

        // Fetch fee and lane latency in parallel
        const [fee, latency] = await Promise.all([
          sourceChain.getFee({
            router: sourceConfig.routerAddress,
            destChainSelector,
            message,
          }),
          sourceChain.getLaneLatency(destChainSelector).catch(() => null), // Non-critical — don't fail if latency unavailable
        ]);

        // Get fee token info for proper formatting
        let feeDecimals: number;
        let feeSymbol: string;
        if (feeTokenAddress) {
          const feeTokenInfo = await sourceChain.getTokenInfo(feeTokenAddress);
          feeDecimals = feeTokenInfo.decimals;
          feeSymbol = feeTokenInfo.symbol;
        } else {
          feeDecimals = sourceConfig.nativeCurrency.decimals;
          feeSymbol = sourceConfig.nativeCurrency.symbol;
        }

        const feeFormatted = `${formatAmount(fee, feeDecimals)} ${feeSymbol}`;
        const estimatedTime = latency ? formatLaneLatency(latency.totalMs) : null;

        setState((prev) => ({
          ...prev,
          status: "idle",
          fee,
          feeFormatted,
          estimatedTime,
        }));

        return { fee, feeFormatted, estimatedTime };
      } catch (err) {
        const errorMessage = CCIPError.isCCIPError(err)
          ? (err.recovery ?? err.message)
          : getErrorMessage(err);
        setState((prev) => ({
          ...prev,
          status: "idle",
          error: errorMessage,
        }));
        return null;
      }
    },
    [] // No dependencies - getChainInstance is module-level
  );

  /**
   * Execute the cross-chain token transfer
   *
   * Uses SDK's sendMessage() which handles:
   * - Token approvals (prompts wallet if needed)
   * - Transaction signing
   * - CCIP message sending
   *
   * @param sourceNetwork - Source network ID (e.g., "ethereum-testnet-sepolia")
   * @param destNetwork - Destination network ID
   * @param tokenSymbol - Token symbol (e.g., "CCIP-BnM")
   * @param amount - Human-readable amount (e.g., "1.5")
   * @param receiver - Destination address
   * @param feeToken - Fee token option ("native" or "link")
   */
  const transfer = useCallback(
    async (
      sourceNetwork: string,
      destNetwork: string,
      tokenSymbol: string,
      amount: string,
      receiver: string,
      feeToken: FeeTokenOption = "native"
    ) => {
      // Validate wallet connection
      if (!walletClient || !address) {
        setState((prev) => ({
          ...prev,
          status: "failed",
          error: "Wallet not connected",
        }));
        return null;
      }

      setState((prev) => ({ ...prev, status: "sending", error: null }));

      try {
        const sourceConfig = NETWORKS[sourceNetwork];
        if (!sourceConfig) {
          throw new Error("Invalid source network configuration");
        }

        const tokenAddress = getTokenAddress(tokenSymbol, sourceNetwork);
        if (!tokenAddress) {
          throw new Error(`Token ${tokenSymbol} not found on ${sourceNetwork}`);
        }

        // Reuse cached chain instance
        const sourceChain = await getChainInstance(sourceNetwork);

        // Destination chain selector from static metadata
        const destChainSelector = networkInfo(destNetwork).chainSelector;

        // Get token info
        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
        const amountWei = parseAmount(amount, tokenInfo.decimals);

        // Resolve fee token address
        const feeTokenAddress = resolveFeeTokenAddress(feeToken, sourceNetwork);

        // Reuse fee from estimate step if available, otherwise get it
        // (User should estimate first, but we handle both cases)
        let fee: bigint;
        let feeDecimals: number;
        let feeSymbol: string;

        if (state.fee && state.feeFormatted) {
          // Reuse already-estimated fee
          fee = state.fee;
          // Parse symbol from formatted string (e.g., "0.026 LINK" -> "LINK")
          const parts = state.feeFormatted.split(" ");
          feeSymbol = parts[parts.length - 1] ?? sourceConfig.nativeCurrency.symbol;
          feeDecimals = feeTokenAddress
            ? (await sourceChain.getTokenInfo(feeTokenAddress)).decimals
            : sourceConfig.nativeCurrency.decimals;
        } else {
          // No fee estimated yet - get it now
          const message = buildTokenTransferMessage({
            receiver,
            tokenAddress,
            amount: amountWei,
            feeToken: feeTokenAddress,
          });

          fee = await sourceChain.getFee({
            router: sourceConfig.routerAddress,
            destChainSelector,
            message,
          });

          // Get fee token info for formatting
          if (feeTokenAddress) {
            const feeTokenInfo = await sourceChain.getTokenInfo(feeTokenAddress);
            feeDecimals = feeTokenInfo.decimals;
            feeSymbol = feeTokenInfo.symbol;
          } else {
            feeDecimals = sourceConfig.nativeCurrency.decimals;
            feeSymbol = sourceConfig.nativeCurrency.symbol;
          }
        }

        // Validate balances before attempting transfer
        const tokenBalance = await sourceChain.getBalance({ holder: address, token: tokenAddress });

        // Check token balance
        if (tokenBalance < amountWei) {
          throw new Error(
            `Insufficient ${tokenSymbol}. Need ${formatAmount(amountWei, tokenInfo.decimals)} ${tokenSymbol}`
          );
        }

        // Check fee token balance
        if (feeTokenAddress) {
          const feeTokenBalance = await sourceChain.getBalance({
            holder: address,
            token: feeTokenAddress,
          });
          if (feeTokenBalance < fee) {
            throw new Error(
              `Insufficient ${feeSymbol} for fee. Need ${formatAmount(fee, feeDecimals)} ${feeSymbol}, have ${formatAmount(feeTokenBalance, feeDecimals)} ${feeSymbol}`
            );
          }
        } else {
          // Paying with native - need enough for fee + gas
          const nativeBalance = await sourceChain.getBalance({ holder: address });
          if (nativeBalance < fee) {
            throw new Error(
              `Insufficient ${sourceConfig.nativeCurrency.symbol} for fee. Need ${formatAmount(fee, feeDecimals)} ${feeSymbol}`
            );
          }
        }

        // Build the final message with fee
        const message = buildTokenTransferMessage({
          receiver,
          tokenAddress,
          amount: amountWei,
          feeToken: feeTokenAddress,
        });

        /**
         * SDK sendMessage() handles:
         * 1. Check token allowance
         * 2. Request approval if needed (wallet prompt)
         * 3. Send CCIP message (wallet prompt)
         * 4. Return CCIPRequest with tx hash and messageId
         *
         * viemWallet() converts wagmi's WalletClient to SDK-compatible wallet
         */
        const request = await sourceChain.sendMessage({
          router: sourceConfig.routerAddress,
          destChainSelector,
          message: { ...message, fee },
          wallet: viemWallet(walletClient),
        });

        const txHash = request.tx.hash;
        const messageId = request.message.messageId;

        setState((prev) => ({
          ...prev,
          status: "success",
          error: null,
          txHash,
          messageId,
        }));

        return { txHash, messageId };
      } catch (err) {
        const errorMessage = CCIPError.isCCIPError(err)
          ? (err.recovery ?? err.message)
          : getErrorMessage(err);
        setState((prev) => ({
          ...prev,
          status: "failed",
          error: errorMessage,
        }));
        return null;
      }
    },
    [walletClient, address]
  );

  return {
    ...state,
    estimateFee,
    transfer,
    reset,
  };
}
