/**
 * Hook for fetching token info and balance from the CCIP SDK
 *
 * Fetches on-chain token metadata (symbol, name, decimals) and balance
 * using the SDK's getTokenInfo() and getBalance() methods.
 *
 * This avoids hardcoding token metadata in the config.
 *
 * @example
 * ```tsx
 * const { tokenInfo, balance, isLoading } = useTokenInfo(
 *   "ethereum-testnet-sepolia",
 *   "0xFd57...",
 *   "0x1234..." // holder address
 * );
 *
 * console.log(tokenInfo?.symbol); // "CCIP-BnM"
 * console.log(tokenInfo?.decimals); // 18
 * console.log(balance); // 1000000000000000000n
 * ```
 */

import { useState, useEffect, useCallback } from "react";
import { fromViemClient } from "@chainlink/ccip-sdk/viem";
import type { TokenInfo } from "@chainlink/ccip-sdk";
import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import { getPublicClient } from "wagmi/actions";
import { NETWORKS } from "@ccip-examples/shared-config";
import { toGenericPublicClient, formatAmount } from "@ccip-examples/shared-utils";
import { wagmiConfig, NETWORK_TO_CHAIN_ID } from "../config/wagmi.js";

// Re-export SDK's TokenInfo so consumers don't need a direct SDK import
export type { TokenInfo };

/**
 * Hook result
 */
export interface UseTokenInfoResult {
  /** Token metadata (symbol, name, decimals) */
  tokenInfo: TokenInfo | null;
  /** Token balance in smallest unit (wei) */
  balance: bigint | null;
  /** Formatted balance for display */
  balanceFormatted: string | null;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Refetch token info and balance */
  refetch: () => Promise<void>;
}

/**
 * Type for chain IDs configured in wagmi
 */
type ConfiguredChainId = (typeof wagmiConfig)["chains"][number]["id"];

/**
 * Hook for fetching token info and balance
 *
 * @param networkId - SDK-compatible network ID (e.g., "ethereum-testnet-sepolia")
 * @param tokenAddress - Token contract address (null to skip)
 * @param holderAddress - Address to check balance for (null to skip balance)
 */
export function useTokenInfo(
  networkId: string | null,
  tokenAddress: string | null,
  holderAddress: string | null
): UseTokenInfoResult {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch token info and balance from SDK
   */
  const fetchData = useCallback(async () => {
    if (!networkId || !tokenAddress) {
      setTokenInfo(null);
      setBalance(null);
      return;
    }

    const config = NETWORKS[networkId];
    if (!config || networkInfo(networkId).family !== ChainFamily.EVM) {
      setError(`Invalid EVM network: ${networkId}`);
      return;
    }

    // Verify network is configured in wagmi before lookup
    if (!(networkId in NETWORK_TO_CHAIN_ID)) {
      setError(`Network not configured in wagmi: ${networkId}`);
      return;
    }
    const chainId = NETWORK_TO_CHAIN_ID[networkId] as ConfiguredChainId;

    setIsLoading(true);
    setError(null);

    try {
      const client = getPublicClient(wagmiConfig, { chainId });
      const chain = await fromViemClient(toGenericPublicClient(client));

      // Fetch token info from SDK
      const info = await chain.getTokenInfo(tokenAddress);
      setTokenInfo({
        symbol: info.symbol,
        name: info.name || info.symbol,
        decimals: info.decimals,
      });

      // Fetch balance if holder provided
      if (holderAddress) {
        const bal = await chain.getBalance({
          holder: holderAddress,
          token: tokenAddress,
        });
        setBalance(bal);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch token info";
      setError(message);
      console.error("Token info fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [networkId, tokenAddress, holderAddress]);

  /**
   * Fetch on mount and when dependencies change
   */
  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /**
   * Calculate formatted balance
   */
  const balanceFormatted =
    balance !== null && tokenInfo ? formatAmount(balance, tokenInfo.decimals) : null;

  return {
    tokenInfo,
    balance,
    balanceFormatted,
    isLoading,
    error,
    refetch: fetchData,
  };
}
