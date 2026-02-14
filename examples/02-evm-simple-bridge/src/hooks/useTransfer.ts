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
import { fromViemClient, viemWallet } from "@chainlink/ccip-sdk/viem";
import { CCIPError } from "@chainlink/ccip-sdk";
import { getPublicClient } from "wagmi/actions";
import { NETWORKS, getTokenAddress } from "@ccip-examples/shared-config";
import {
  parseAmount,
  formatAmount,
  toGenericPublicClient,
  getErrorMessage,
} from "@ccip-examples/shared-utils";
import { wagmiConfig, NETWORK_TO_CHAIN_ID } from "../config/wagmi.js";

/**
 * Type for chain IDs configured in wagmi
 */
type ConfiguredChainId = (typeof wagmiConfig)["chains"][number]["id"];

/**
 * Transfer lifecycle states
 *
 * Simplified states since SDK handles the details:
 * - idle: Ready for new transfer
 * - estimating: Calculating CCIP fee
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
}

const initialState: TransferState = {
  status: "idle",
  error: null,
  txHash: null,
  messageId: null,
  fee: null,
  feeFormatted: null,
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
   * Get SDK chain instance for a network (read-only)
   */
  const getChainInstance = useCallback(async (networkId: string) => {
    if (!(networkId in NETWORK_TO_CHAIN_ID)) {
      throw new Error(`Network not configured: ${networkId}`);
    }
    const chainId = NETWORK_TO_CHAIN_ID[networkId] as ConfiguredChainId;
    const client = getPublicClient(wagmiConfig, { chainId });
    return fromViemClient(toGenericPublicClient(client));
  }, []);

  /**
   * Estimate the transfer fee without executing
   *
   * @param sourceNetwork - Source network ID (e.g., "ethereum-testnet-sepolia")
   * @param destNetwork - Destination network ID
   * @param tokenSymbol - Token symbol (e.g., "CCIP-BnM")
   * @param amount - Human-readable amount (e.g., "1.5")
   * @param receiver - Destination address
   */
  const estimateFee = useCallback(
    async (
      sourceNetwork: string,
      destNetwork: string,
      tokenSymbol: string,
      amount: string,
      receiver: string
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

        // Get SDK chain instances (read-only for fee estimation)
        const sourceChain = await getChainInstance(sourceNetwork);
        const destChain = await getChainInstance(destNetwork);

        // Get destination chainSelector from SDK
        const destChainSelector = destChain.network.chainSelector;

        // Get token decimals from SDK
        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
        const amountWei = parseAmount(amount, tokenInfo.decimals);

        // Build CCIP message for fee estimation
        const message = {
          receiver,
          data: "0x" as const,
          tokenAmounts: [{ token: tokenAddress, amount: amountWei }],
          extraArgs: { gasLimit: 0n },
        };

        // Get fee estimate from SDK
        const fee = await sourceChain.getFee({
          router: sourceConfig.routerAddress,
          destChainSelector,
          message,
        });

        const feeFormatted = formatAmount(fee, sourceConfig.nativeCurrency.decimals);

        setState((prev) => ({
          ...prev,
          status: "idle",
          fee,
          feeFormatted,
        }));

        return { fee, feeFormatted };
      } catch (err) {
        // Use SDK error handling for CCIP errors, fallback to generic message extraction
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
    [getChainInstance]
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
   */
  const transfer = useCallback(
    async (
      sourceNetwork: string,
      destNetwork: string,
      tokenSymbol: string,
      amount: string,
      receiver: string
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

        // Get SDK chain instances
        const sourceChain = await getChainInstance(sourceNetwork);
        const destChain = await getChainInstance(destNetwork);

        // Get destination chainSelector from SDK
        const destChainSelector = destChain.network.chainSelector;

        // Get token decimals from SDK
        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
        const amountWei = parseAmount(amount, tokenInfo.decimals);

        // Build CCIP message
        const message = {
          receiver,
          data: "0x" as const,
          tokenAmounts: [{ token: tokenAddress, amount: amountWei }],
          extraArgs: { gasLimit: 0n },
        };

        // Get fee
        const fee = await sourceChain.getFee({
          router: sourceConfig.routerAddress,
          destChainSelector,
          message,
        });

        setState((prev) => ({
          ...prev,
          fee,
          feeFormatted: formatAmount(fee, sourceConfig.nativeCurrency.decimals),
        }));

        /**
         * SDK sendMessage() handles:
         * 1. Check token allowance
         * 2. Request approval if needed (wallet prompt)
         * 3. Send CCIP message (wallet prompt)
         * 4. Return CCIPRequest with tx hash and message
         *
         * viemWallet() converts wagmi's WalletClient to ethers-compatible signer
         */
        const request = await sourceChain.sendMessage({
          router: sourceConfig.routerAddress,
          destChainSelector,
          message: { ...message, fee },
          wallet: viemWallet(walletClient),
        });

        // Extract tx hash and message ID from the CCIPRequest
        const txHash = request.tx.hash;
        const messageId = request.message.messageId;

        setState({
          status: "success",
          error: null,
          txHash,
          messageId,
          fee,
          feeFormatted: formatAmount(fee, sourceConfig.nativeCurrency.decimals),
        });

        return { txHash, messageId };
      } catch (err) {
        // Use SDK error handling for CCIP errors, fallback to generic message extraction
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
    [walletClient, address, getChainInstance]
  );

  return {
    ...state,
    estimateFee,
    transfer,
    reset,
  };
}
