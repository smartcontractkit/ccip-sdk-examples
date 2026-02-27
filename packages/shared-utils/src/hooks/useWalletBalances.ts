/**
 * Hook for fetching wallet balances (native, LINK, and token).
 *
 * Fetches all three balance types in parallel using the SDK.
 * Token metadata is fetched dynamically (no hardcoding).
 *
 * Accepts a pluggable getChain so example 02 (wagmi) and 03 (ChainContext)
 * can provide chain instances without this package depending on wagmi or Solana.
 *
 * @example
 * ```tsx
 * const getChain = useGetChain(); // or useChains().getChain
 * const { native, link, token, isLoading } = useWalletBalances(
 *   "ethereum-testnet-sepolia",
 *   "0xFd57...", // BnM token address
 *   "0x1234...", // holder address
 *   getChain
 * );
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { Chain } from "@chainlink/ccip-sdk";
import { NETWORKS, getTokenAddress } from "@ccip-examples/shared-config";
import { formatAmount } from "../validation.js";

export interface BalanceData {
  /** Raw balance in smallest unit */
  balance: bigint | null;
  /** Formatted balance for display */
  formatted: string | null;
  /** Token/currency symbol */
  symbol: string;
  /** Token/currency decimals */
  decimals: number;
}

export interface WalletBalances {
  /** Native currency balance (ETH, SOL, AVAX, etc.) */
  native: BalanceData;
  /** LINK token balance, null if LINK not configured for network */
  link: BalanceData | null;
  /** Transfer token balance (e.g., CCIP-BnM) */
  token: BalanceData | null;
  /** Whether any balance is loading */
  isLoading: boolean;
  /** Error message if any fetch failed */
  error: string | null;
  /** Refetch all balances */
  refetch: () => Promise<void>;
}

const defaultBalanceData = (symbol: string, decimals: number): BalanceData => ({
  balance: null,
  formatted: null,
  symbol,
  decimals,
});

export type GetChain = (networkId: string) => Promise<Chain>;

/**
 * @param tokenSymbolHint - Optional fallback symbol when on-chain metadata
 *   returns "UNKNOWN" (e.g. Solana SPL tokens without metadata).
 *   On-chain symbol is preferred; hint is used only as last resort.
 */
export function useWalletBalances(
  networkId: string | null,
  tokenAddress: string | null,
  holderAddress: string | null,
  getChain: GetChain,
  tokenSymbolHint?: string
): WalletBalances {
  const [native, setNative] = useState<BalanceData>(defaultBalanceData("", 18));
  const [link, setLink] = useState<BalanceData | null>(null);
  const [token, setToken] = useState<BalanceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (!networkId || !holderAddress) {
      setNative(defaultBalanceData("", 18));
      setLink(null);
      setToken(null);
      setError(null);
      return;
    }

    const config = NETWORKS[networkId];
    if (!config) {
      setError(`Invalid network: ${networkId}`);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    setNative(defaultBalanceData(config.nativeCurrency.symbol, config.nativeCurrency.decimals));

    try {
      const chain = await getChain(networkId);
      const linkAddress = getTokenAddress("LINK", networkId);

      const promises: Promise<void>[] = [];

      promises.push(
        chain
          .getBalance({ holder: holderAddress })
          .then((bal) => {
            if (fetchId !== fetchIdRef.current) return;
            setNative({
              balance: bal,
              formatted: formatAmount(bal, config.nativeCurrency.decimals),
              symbol: config.nativeCurrency.symbol,
              decimals: config.nativeCurrency.decimals,
            });
          })
          .catch((err) => {
            if (fetchId !== fetchIdRef.current) return;
            console.error("Failed to fetch native balance:", err);
          })
      );

      if (linkAddress) {
        promises.push(
          (async () => {
            try {
              const [linkInfo, linkBal] = await Promise.all([
                chain.getTokenInfo(linkAddress),
                chain.getBalance({ holder: holderAddress, token: linkAddress }),
              ]);
              if (fetchId !== fetchIdRef.current) return;
              const linkSymbol =
                linkInfo.symbol && linkInfo.symbol !== "UNKNOWN" ? linkInfo.symbol : "LINK";
              setLink({
                balance: linkBal,
                formatted: formatAmount(linkBal, linkInfo.decimals),
                symbol: linkSymbol,
                decimals: linkInfo.decimals,
              });
            } catch (err) {
              if (fetchId !== fetchIdRef.current) return;
              console.error("Failed to fetch LINK balance:", err);
              setLink(null);
            }
          })()
        );
      } else {
        setLink(null);
      }

      if (tokenAddress) {
        promises.push(
          (async () => {
            try {
              const [tokenInfo, tokenBal] = await Promise.all([
                chain.getTokenInfo(tokenAddress),
                chain.getBalance({ holder: holderAddress, token: tokenAddress }),
              ]);
              if (fetchId !== fetchIdRef.current) return;
              // Prefer on-chain symbol; fall back to hint for tokens without metadata (e.g. Solana SPL)
              const symbol =
                tokenInfo.symbol && tokenInfo.symbol !== "UNKNOWN"
                  ? tokenInfo.symbol
                  : (tokenSymbolHint ?? tokenInfo.symbol);
              setToken({
                balance: tokenBal,
                formatted: formatAmount(tokenBal, tokenInfo.decimals),
                symbol,
                decimals: tokenInfo.decimals,
              });
            } catch (err) {
              if (fetchId !== fetchIdRef.current) return;
              console.error("Failed to fetch token balance:", err);
              setToken(null);
            }
          })()
        );
      } else {
        setToken(null);
      }

      await Promise.all(promises);
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to fetch balances";
      setError(message);
      console.error("Balance fetch error:", err);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [networkId, tokenAddress, holderAddress, getChain]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
    native,
    link,
    token,
    isLoading,
    error,
    refetch: fetchData,
  };
}
