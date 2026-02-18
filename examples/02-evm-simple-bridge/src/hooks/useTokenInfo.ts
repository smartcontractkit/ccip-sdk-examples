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
import type { TokenInfo } from "@chainlink/ccip-sdk";
import { formatAmount } from "@ccip-examples/shared-utils";
import { NETWORKS } from "@ccip-examples/shared-config";
import { getChainInstance } from "./useChain.js";

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
 * Hook for fetching token info and balance
 *
 * @param networkId - SDK-compatible network ID (e.g., "ethereum-testnet-sepolia")
 * @param tokenAddress - Token contract address (null for native balance)
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
    if (!networkId) {
      setTokenInfo(null);
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use shared chain instance cache
      const chain = await getChainInstance(networkId);

      // Handle token info
      if (tokenAddress) {
        // Fetch token info from SDK
        const info = await chain.getTokenInfo(tokenAddress);
        setTokenInfo({
          symbol: info.symbol,
          name: info.name ?? info.symbol,
          decimals: info.decimals,
        });
      } else {
        // Native balance - no token info needed
        setTokenInfo(null);
      }

      // Fetch balance if holder provided
      if (holderAddress) {
        // For native balance: call without token parameter
        // For token balance: include token parameter
        const bal = tokenAddress
          ? await chain.getBalance({ holder: holderAddress, token: tokenAddress })
          : await chain.getBalance({ holder: holderAddress });
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
   * For native balance (tokenInfo is null), use network's native currency decimals
   */
  const balanceFormatted = (() => {
    if (balance === null) return null;

    if (tokenInfo) {
      // Token balance - use token decimals
      return formatAmount(balance, tokenInfo.decimals);
    } else if (networkId) {
      // Native balance - use network's native currency decimals
      const network = NETWORKS[networkId];
      return network ? formatAmount(balance, network.nativeCurrency.decimals) : null;
    }

    return null;
  })();

  return {
    tokenInfo,
    balance,
    balanceFormatted,
    isLoading,
    error,
    refetch: fetchData,
  };
}
