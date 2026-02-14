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

import { useState, useCallback, useRef } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { fromViemClient, viemWallet } from "@chainlink/ccip-sdk/viem";
import { networkInfo, CCIPError } from "@chainlink/ccip-sdk";
import type { Chain } from "@chainlink/ccip-sdk";
import { getPublicClient } from "wagmi/actions";
import { NETWORKS, getTokenAddress } from "@ccip-examples/shared-config";
import {
  parseAmount,
  formatAmount,
  toGenericPublicClient,
  getErrorMessage,
  buildTokenTransferMessage,
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

/**
 * Format milliseconds as a human-friendly estimate string.
 */
function formatLatency(totalMs: number): string {
  const minutes = Math.round(totalMs / 60_000);
  if (minutes < 1) return "~<1 min";
  return `~${minutes} min`;
}

export function useTransfer() {
  const [state, setState] = useState<TransferState>(initialState);

  // Wagmi hooks for wallet interaction
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Memoized chain instances — reused across estimateFee / transfer calls
  // for the same network to avoid repeated RPC handshakes.
  const chainCacheRef = useRef<Map<string, Chain>>(new Map());

  /**
   * Reset transfer state to initial values
   */
  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  /**
   * Get (or reuse) an SDK chain instance for a network.
   */
  const getChainInstance = useCallback(async (networkId: string): Promise<Chain> => {
    const cached = chainCacheRef.current.get(networkId);
    if (cached) return cached;

    if (!(networkId in NETWORK_TO_CHAIN_ID)) {
      throw new Error(`Network not configured: ${networkId}`);
    }
    const chainId = NETWORK_TO_CHAIN_ID[networkId] as ConfiguredChainId;
    const client = getPublicClient(wagmiConfig, { chainId });
    const chain = await fromViemClient(toGenericPublicClient(client));
    chainCacheRef.current.set(networkId, chain);
    return chain;
  }, []);

  /**
   * Estimate the transfer fee and lane latency without executing.
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

        const sourceChain = await getChainInstance(sourceNetwork);

        // Destination chain selector from static metadata — no RPC needed
        const destChainSelector = networkInfo(destNetwork).chainSelector;

        // Get token decimals from SDK
        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
        const amountWei = parseAmount(amount, tokenInfo.decimals);

        // Build message using shared utility
        const message = buildTokenTransferMessage({
          receiver,
          tokenAddress,
          amount: amountWei,
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

        const feeFormatted = formatAmount(fee, sourceConfig.nativeCurrency.decimals);
        const estimatedTime = latency ? formatLatency(latency.totalMs) : null;

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

        // Reuse cached chain instance
        const sourceChain = await getChainInstance(sourceNetwork);

        // Destination chain selector from static metadata
        const destChainSelector = networkInfo(destNetwork).chainSelector;

        // Get token decimals from SDK
        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
        const amountWei = parseAmount(amount, tokenInfo.decimals);

        // Build message using shared utility
        const message = buildTokenTransferMessage({
          receiver,
          tokenAddress,
          amount: amountWei,
        });

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
    [walletClient, address, getChainInstance]
  );

  return {
    ...state,
    estimateFee,
    transfer,
    reset,
  };
}
