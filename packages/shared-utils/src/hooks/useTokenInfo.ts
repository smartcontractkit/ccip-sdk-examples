/**
 * Hook for fetching token info and balance from the CCIP SDK.
 *
 * Fetches on-chain token metadata (symbol, name, decimals) and balance
 * using the SDK's getTokenInfo() and getBalance() methods.
 *
 * Accepts a pluggable getChain so example 02 (wagmi) and 03 (ChainContext)
 * can provide chain instances.
 *
 * @example
 * ```tsx
 * const getChain = useGetChain(); // or useChains().getChain
 * const { tokenInfo, balance, isLoading } = useTokenInfo(
 *   "ethereum-testnet-sepolia",
 *   "0xFd57...",
 *   "0x1234...", // holder address
 *   getChain
 * );
 * ```
 */

import { useState, useEffect, useCallback } from "react";
import type { TokenInfo } from "@chainlink/ccip-sdk";
import { formatAmount } from "../validation.js";
import type { GetChain } from "./useWalletBalances.js";

export type { TokenInfo };

export interface UseTokenInfoResult {
  tokenInfo: TokenInfo | null;
  balance: bigint | null;
  balanceFormatted: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTokenInfo(
  networkId: string | null,
  tokenAddress: string | null,
  holderAddress: string | null,
  getChain: GetChain
): UseTokenInfoResult {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!networkId || !tokenAddress) {
      setTokenInfo(null);
      setBalance(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const chain = await getChain(networkId);
      const info = await chain.getTokenInfo(tokenAddress);
      setTokenInfo({
        symbol: info.symbol,
        name: info.name ?? info.symbol,
        decimals: info.decimals,
      });

      if (holderAddress) {
        const bal = await chain.getBalance({
          holder: holderAddress,
          token: tokenAddress,
        });
        setBalance(bal);
      } else {
        setBalance(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch token info";
      setError(message);
      setTokenInfo(null);
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [networkId, tokenAddress, holderAddress, getChain]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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
