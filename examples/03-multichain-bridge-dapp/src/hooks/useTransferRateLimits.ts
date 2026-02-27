/**
 * Source and destination pool rate limits during an in-progress transfer.
 * Composes the same data flow as useTokenPoolInfo; adds destination pool and polling when isActive.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { networkInfo } from "@chainlink/ccip-sdk";
import type { RateLimiterState } from "@chainlink/ccip-sdk";
import { RATE_LIMIT_POLLING_INTERVAL_MS } from "@ccip-examples/shared-config";
import { NETWORKS } from "@ccip-examples/shared-config";
import { useChains } from "./useChains.js";
import type { RateLimitBucket } from "@ccip-examples/shared-utils";

function toRateLimitBucket(state: RateLimiterState): RateLimitBucket | null {
  if (!state) return null;
  return {
    tokens: state.tokens,
    capacity: state.capacity,
    rate: state.rate,
    isEnabled: true,
  };
}

export interface TransferRateLimitsState {
  sourceOutbound: RateLimitBucket | null;
  sourceInbound: RateLimitBucket | null;
  destOutbound: RateLimitBucket | null;
  destInbound: RateLimitBucket | null;
}

export interface UseTransferRateLimitsParams {
  sourceNetworkId: string | null;
  destNetworkId: string | null;
  tokenAddress: string | null;
  isActive: boolean;
}

export interface UseTransferRateLimitsResult {
  sourceOutbound: RateLimitBucket | null;
  sourceInbound: RateLimitBucket | null;
  destOutbound: RateLimitBucket | null;
  destInbound: RateLimitBucket | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTransferRateLimits({
  sourceNetworkId,
  destNetworkId,
  tokenAddress,
  isActive,
}: UseTransferRateLimitsParams): UseTransferRateLimitsResult {
  const { getChain } = useChains();
  const [state, setState] = useState<TransferRateLimitsState>({
    sourceOutbound: null,
    sourceInbound: null,
    destOutbound: null,
    destInbound: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRateLimits = useCallback(async () => {
    if (!sourceNetworkId || !destNetworkId || !tokenAddress) {
      setState({
        sourceOutbound: null,
        sourceInbound: null,
        destOutbound: null,
        destInbound: null,
      });
      setError(null);
      return;
    }

    const sourceConfig = NETWORKS[sourceNetworkId];
    const destConfig = NETWORKS[destNetworkId];
    const destChainSelector = networkInfo(destNetworkId).chainSelector;
    const sourceChainSelector = networkInfo(sourceNetworkId).chainSelector;

    if (!sourceConfig || !destConfig || !destChainSelector || !sourceChainSelector) {
      setError("Invalid network configuration");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sourceChain = await getChain(sourceNetworkId);
      const sourceRouter = sourceConfig.routerAddress;
      const sourceRegistry = await sourceChain.getTokenAdminRegistryFor(sourceRouter);
      const sourceTokenConfig = await sourceChain.getRegistryTokenConfig(
        sourceRegistry,
        tokenAddress
      );
      const sourcePoolAddress = sourceTokenConfig.tokenPool;

      if (!sourcePoolAddress) {
        setError("No token pool found on source");
        setIsLoading(false);
        return;
      }

      let remoteToken: string | null = null;
      let sourceOutbound: RateLimitBucket | null = null;
      let sourceInbound: RateLimitBucket | null = null;

      try {
        const sourceRemote = await sourceChain.getTokenPoolRemote(
          sourcePoolAddress,
          destChainSelector
        );
        remoteToken = sourceRemote.remoteToken;
        sourceOutbound = toRateLimitBucket(sourceRemote.outboundRateLimiterState);
        sourceInbound = toRateLimitBucket(sourceRemote.inboundRateLimiterState);
      } catch {
        // Lane not supported
      }

      let destOutbound: RateLimitBucket | null = null;
      let destInbound: RateLimitBucket | null = null;

      if (remoteToken) {
        try {
          const destChain = await getChain(destNetworkId);
          const destRouter = destConfig.routerAddress;
          const destRegistry = await destChain.getTokenAdminRegistryFor(destRouter);
          const destTokenConfig = await destChain.getRegistryTokenConfig(destRegistry, remoteToken);
          const destPoolAddress = destTokenConfig.tokenPool;

          if (destPoolAddress) {
            const destRemote = await destChain.getTokenPoolRemote(
              destPoolAddress,
              sourceChainSelector
            );
            destOutbound = toRateLimitBucket(destRemote.outboundRateLimiterState);
            destInbound = toRateLimitBucket(destRemote.inboundRateLimiterState);
          }
        } catch {
          // Dest pool optional; keep source limits
        }
      }

      if (mountedRef.current) {
        setState({
          sourceOutbound,
          sourceInbound,
          destOutbound,
          destInbound,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch rate limits";
      if (mountedRef.current) {
        setError(message);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [sourceNetworkId, destNetworkId, tokenAddress, getChain]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchRateLimits();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchRateLimits]);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => void fetchRateLimits(), RATE_LIMIT_POLLING_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, fetchRateLimits]);

  return {
    sourceOutbound: state.sourceOutbound,
    sourceInbound: state.sourceInbound,
    destOutbound: state.destOutbound,
    destInbound: state.destInbound,
    isLoading,
    error,
    refetch: () => void fetchRateLimits(),
  };
}
