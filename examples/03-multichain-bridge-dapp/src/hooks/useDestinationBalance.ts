/**
 * Destination chain token balance for the receiver.
 * Uses useTokenPoolInfo for remote token and getChain(destNetworkId) for balance.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import { formatAmount, isValidAddress } from "@ccip-examples/shared-utils";
import { useChains } from "./useChains.js";
import { useTokenPoolInfo } from "./useTokenPoolInfo.js";

export interface UseDestinationBalanceResult {
  balance: bigint | null;
  balanceFormatted: string;
  remoteToken: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

function formatBalance(balance: bigint | null, decimals: number): string {
  if (balance === null) return "-";
  return formatAmount(balance, decimals);
}

export function useDestinationBalance(
  sourceNetworkId: string | undefined,
  destNetworkId: string | undefined,
  sourceTokenAddress: string | undefined,
  receiverAddress: string | undefined,
  tokenDecimals?: number
): UseDestinationBalanceResult {
  const { getChain } = useChains();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const { remoteToken, isLoading: poolLoading } = useTokenPoolInfo(
    sourceNetworkId,
    destNetworkId,
    sourceTokenAddress
  );

  const fetchBalance = useCallback(async () => {
    if (!destNetworkId || !receiverAddress || !remoteToken) {
      setBalance(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const family = networkInfo(destNetworkId).family;
    if (!isValidAddress(receiverAddress, family)) {
      setBalance(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const chain = await getChain(destNetworkId);
      const tokenBalance = await chain.getBalance({
        holder: receiverAddress,
        token: remoteToken,
      });

      if (isMountedRef.current) {
        setBalance(tokenBalance);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch balance";
      if (isMountedRef.current) {
        setError(message);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [destNetworkId, receiverAddress, remoteToken, getChain]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchBalance();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchBalance]);

  const decimals =
    tokenDecimals ??
    (destNetworkId && networkInfo(destNetworkId).family === ChainFamily.Solana ? 9 : 18);

  return {
    balance,
    balanceFormatted: formatBalance(balance, decimals),
    remoteToken,
    isLoading: isLoading || poolLoading,
    error,
    refetch: () => void fetchBalance(),
  };
}
