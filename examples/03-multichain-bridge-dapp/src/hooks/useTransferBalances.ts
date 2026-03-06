/**
 * Source and destination token balances during an in-progress transfer.
 * Composes useDestinationBalance for destination; adds source balance and polling when isActive.
 *
 * Uses sequential timeout-based polling (waits for fetch completion before scheduling next)
 * to prevent connection exhaustion when RPC responses are slow.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { BALANCE_POLLING_INTERVAL_MS } from "@ccip-examples/shared-config";
import { useChains } from "./useChains.js";
import { useDestinationBalance } from "./useDestinationBalance.js";
import { logSDKCall } from "../inspector/index.js";
import { getAnnotation } from "../inspector/annotations.js";

export interface UseTransferBalancesParams {
  sourceNetworkId: string | null;
  destNetworkId: string | null;
  senderAddress: string | null;
  receiverAddress: string | null;
  tokenAddress: string | null;
  /** Already-resolved remote token address (skips useTokenPoolInfo in useDestinationBalance) */
  remoteToken?: string | null;
  isActive: boolean;
  tokenDecimals?: number;
  /** Captured before transfer for "before vs after" display */
  initialSourceBalance?: bigint | null;
  /** Captured before transfer for "before vs after" display */
  initialDestBalance?: bigint | null;
}

export interface UseTransferBalancesResult {
  sourceBalance: bigint | null;
  destBalance: bigint | null;
  sourceLoading: boolean;
  destLoading: boolean;
  sourceError: string | null;
  destError: string | null;
  refetch: () => void;
  /** When provided by caller, for "before vs after" display */
  initialSourceBalance: bigint | null;
  /** When provided by caller, for "before vs after" display */
  initialDestBalance: bigint | null;
}

export function useTransferBalances({
  sourceNetworkId,
  destNetworkId,
  senderAddress,
  receiverAddress,
  tokenAddress,
  remoteToken,
  isActive,
  tokenDecimals = 18,
  initialSourceBalance: initialSourceBalanceParam,
  initialDestBalance: initialDestBalanceParam,
}: UseTransferBalancesParams): UseTransferBalancesResult {
  const { getChain } = useChains();
  const [sourceBalance, setSourceBalance] = useState<bigint | null>(
    initialSourceBalanceParam ?? null
  );
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dest = useDestinationBalance(
    sourceNetworkId ?? undefined,
    destNetworkId ?? undefined,
    tokenAddress ?? undefined,
    receiverAddress ?? undefined,
    tokenDecimals,
    remoteToken ?? undefined
  );

  const fetchSourceBalance = useCallback(async () => {
    if (!sourceNetworkId || !senderAddress || !tokenAddress) {
      setSourceBalance(null);
      setSourceError(null);
      return;
    }
    setSourceLoading(true);
    setSourceError(null);
    try {
      const chain = await getChain(sourceNetworkId);
      const balance = await logSDKCall(
        {
          method: "chain.getBalance",
          phase: "tracking",
          displayArgs: { holder: senderAddress, token: tokenAddress, side: "source" },
          ...getAnnotation("chain.getBalance"),
          isPolling: true,
          pollingId: "chain.getBalance:source",
        },
        () => chain.getBalance({ holder: senderAddress, token: tokenAddress })
      );
      if (mountedRef.current) {
        setSourceBalance(balance);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch source balance";
      if (mountedRef.current) {
        setSourceError(message);
      }
    } finally {
      if (mountedRef.current) {
        setSourceLoading(false);
      }
    }
  }, [sourceNetworkId, senderAddress, tokenAddress, getChain]);

  const refetch = useCallback(() => {
    void fetchSourceBalance();
    dest.refetch();
  }, [fetchSourceBalance, dest]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    void fetchSourceBalance();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchSourceBalance]);

  // Sequential polling: wait for fetch to complete, then wait BALANCE_POLLING_INTERVAL_MS, then repeat
  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const pollOnce = async () => {
      await fetchSourceBalance();
      dest.refetch();
      if (!cancelled) {
        timeoutRef.current = setTimeout(() => void pollOnce(), BALANCE_POLLING_INTERVAL_MS);
      }
    };

    // Start first poll after the interval (initial fetch already ran)
    timeoutRef.current = setTimeout(() => void pollOnce(), BALANCE_POLLING_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isActive, fetchSourceBalance, dest]);

  return {
    sourceBalance,
    destBalance: dest.balance,
    sourceLoading,
    destLoading: dest.isLoading,
    sourceError,
    destError: dest.error,
    refetch,
    initialSourceBalance: initialSourceBalanceParam ?? null,
    initialDestBalance: initialDestBalanceParam ?? null,
  };
}
