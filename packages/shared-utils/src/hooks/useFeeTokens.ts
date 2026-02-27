/**
 * Hook for discovering fee tokens (native + SDK getFeeTokens) and their balances.
 * Uses chain.getFeeTokens(routerAddress) when available; if that fails (e.g. not
 * implemented on TON/Sui), only native is offered (already added first).
 * Pluggable getChain so 02 and 03 can pass their chain provider.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { Chain } from "@chainlink/ccip-sdk";
import { NETWORKS, type FeeTokenOptionItem } from "@ccip-examples/shared-config";
import { formatAmount } from "../validation.js";

export type GetChain = (networkId: string) => Promise<Chain>;

export interface UseFeeTokensResult {
  feeTokens: FeeTokenOptionItem[];
  selectedToken: FeeTokenOptionItem | null;
  setSelectedToken: (token: FeeTokenOptionItem) => void;
  isLoading: boolean;
  error: string | null;
  hasInsufficientBalance: (feeAmount: bigint) => boolean;
  getFeeTokenAddress: () => string | undefined;
  refetch: () => Promise<void>;
}

function buildNativeOption(networkId: string, balance: bigint | null): FeeTokenOptionItem | null {
  const config = NETWORKS[networkId];
  if (!config) return null;
  const { name, symbol, decimals } = config.nativeCurrency;
  return {
    address: undefined,
    symbol,
    name,
    decimals,
    balance,
    balanceFormatted: balance !== null ? `${formatAmount(balance, decimals)} ${symbol}` : "—",
  };
}

/** Race a promise against a timeout; resolves to null on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Timeout for getFeeTokens() which can hang on slow RPCs (e.g. public Solana devnet). */
const GET_FEE_TOKENS_TIMEOUT_MS = 15_000;

export function useFeeTokens(
  networkId: string | null,
  routerAddress: string | null,
  holderAddress: string | null,
  getChain: GetChain
): UseFeeTokensResult {
  const [feeTokens, setFeeTokens] = useState<FeeTokenOptionItem[]>([]);
  const [selectedToken, setSelectedTokenState] = useState<FeeTokenOptionItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const setSelectedToken = useCallback((token: FeeTokenOptionItem) => {
    setSelectedTokenState(token);
  }, []);

  const fetchFeeTokens = useCallback(async () => {
    if (!networkId || !routerAddress || !holderAddress) {
      setFeeTokens([]);
      setSelectedTokenState(null);
      setError(null);
      return;
    }

    const config = NETWORKS[networkId];
    if (!config) {
      setError(`Invalid network: ${networkId}`);
      setFeeTokens([]);
      setSelectedTokenState(null);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const chain = await getChain(networkId);

      // Immediately show native option with unknown balance so the UI is not stuck.
      const nativePlaceholder = buildNativeOption(networkId, null);
      if (nativePlaceholder && fetchId === fetchIdRef.current) {
        setFeeTokens([nativePlaceholder]);
        setSelectedTokenState((prev) => prev ?? nativePlaceholder);
        setIsLoading(false);
      }

      // Fetch native balance and fee tokens in parallel.
      const [nativeBal, feeTokenResult] = await Promise.all([
        chain.getBalance({ holder: holderAddress }).catch((err) => {
          console.error("Failed to fetch native balance for fee tokens:", err);
          return null;
        }),
        withTimeout(
          chain.getFeeTokens(routerAddress).catch(() => null),
          GET_FEE_TOKENS_TIMEOUT_MS
        ),
      ]);

      if (fetchId !== fetchIdRef.current) return;

      const options: FeeTokenOptionItem[] = [];

      const nativeOption = buildNativeOption(networkId, nativeBal);
      if (nativeOption) options.push(nativeOption);

      // If getFeeTokens succeeded (didn't timeout or error), resolve additional tokens.
      if (feeTokenResult) {
        const feeTokenEntries = Object.entries(feeTokenResult);
        const tokenOptions = await Promise.all(
          feeTokenEntries.map(async ([address, info]): Promise<FeeTokenOptionItem> => {
            let balance = 0n;
            try {
              balance = await chain.getBalance({
                holder: holderAddress,
                token: address,
              });
            } catch {
              // Token account may not exist (e.g. Solana wallet without this token) — treat as 0
            }
            return {
              address,
              symbol: info.symbol,
              name: info.name,
              decimals: info.decimals,
              balance,
              balanceFormatted: `${formatAmount(balance, info.decimals)} ${info.symbol}`,
            };
          })
        );
        if (fetchId !== fetchIdRef.current) return;
        options.push(...tokenOptions);
      }

      if (fetchId !== fetchIdRef.current) return;
      setFeeTokens(options);
      setSelectedTokenState((prev) => {
        const first = options[0] ?? null;
        if (!prev) return first;
        const stillPresent = options.find((o) => (o.address ?? "") === (prev.address ?? ""));
        return stillPresent ?? first;
      });
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      const message = err instanceof Error ? err.message : "Failed to load fee tokens";
      setError(message);
      setFeeTokens([]);
      setSelectedTokenState(null);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [networkId, routerAddress, holderAddress, getChain]);

  useEffect(() => {
    void fetchFeeTokens();
  }, [fetchFeeTokens]);

  const hasInsufficientBalance = useCallback(
    (feeAmount: bigint): boolean => {
      if (selectedToken?.balance == null) return true;
      return selectedToken.balance < feeAmount;
    },
    [selectedToken]
  );

  const getFeeTokenAddress = useCallback((): string | undefined => {
    return selectedToken?.address;
  }, [selectedToken]);

  return {
    feeTokens,
    selectedToken,
    setSelectedToken,
    isLoading,
    error,
    hasInsufficientBalance,
    getFeeTokenAddress,
    refetch: fetchFeeTokens,
  };
}
