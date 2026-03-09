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
import { logSDKCall } from "../inspector/index.js";
import { getAnnotation } from "../inspector/annotations.js";

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const sourceRegistry = await logSDKCall(
        {
          method: "chain.getTokenAdminRegistryFor",
          phase: "tracking",
          displayArgs: { routerAddress: sourceRouter, side: "source" },
          ...getAnnotation("chain.getTokenAdminRegistryFor"),
          isPolling: true,
          pollingId: "chain.getTokenAdminRegistryFor:source",
        },
        () => sourceChain.getTokenAdminRegistryFor(sourceRouter)
      );
      const sourceTokenConfig = await logSDKCall(
        {
          method: "chain.getRegistryTokenConfig",
          phase: "tracking",
          displayArgs: { registryAddress: String(sourceRegistry), tokenAddress, side: "source" },
          ...getAnnotation("chain.getRegistryTokenConfig"),
          isPolling: true,
          pollingId: "chain.getRegistryTokenConfig:source",
        },
        () => sourceChain.getRegistryTokenConfig(sourceRegistry, tokenAddress)
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
        const sourceRemote = await logSDKCall(
          {
            method: "chain.getTokenPoolRemote",
            phase: "tracking",
            displayArgs: {
              poolAddress: sourcePoolAddress,
              destChainSelector: String(destChainSelector),
              side: "source",
            },
            ...getAnnotation("chain.getTokenPoolRemote"),
            isPolling: true,
            pollingId: "chain.getTokenPoolRemote:source",
          },
          () => sourceChain.getTokenPoolRemote(sourcePoolAddress, destChainSelector)
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
          const destRegistry = await logSDKCall(
            {
              method: "chain.getTokenAdminRegistryFor",
              phase: "tracking",
              displayArgs: { routerAddress: destRouter, side: "destination" },
              ...getAnnotation("chain.getTokenAdminRegistryFor"),
              isPolling: true,
              pollingId: "chain.getTokenAdminRegistryFor:destination",
            },
            () => destChain.getTokenAdminRegistryFor(destRouter)
          );
          const destTokenConfig = await logSDKCall(
            {
              method: "chain.getRegistryTokenConfig",
              phase: "tracking",
              displayArgs: {
                registryAddress: String(destRegistry),
                tokenAddress: remoteToken,
                side: "destination",
              },
              ...getAnnotation("chain.getRegistryTokenConfig"),
              isPolling: true,
              pollingId: "chain.getRegistryTokenConfig:destination",
            },
            () => destChain.getRegistryTokenConfig(destRegistry, remoteToken)
          );
          const destPoolAddress = destTokenConfig.tokenPool;

          if (destPoolAddress) {
            const destRemote = await logSDKCall(
              {
                method: "chain.getTokenPoolRemote",
                phase: "tracking",
                displayArgs: {
                  poolAddress: destPoolAddress,
                  destChainSelector: String(sourceChainSelector),
                  side: "destination",
                },
                ...getAnnotation("chain.getTokenPoolRemote"),
                isPolling: true,
                pollingId: "chain.getTokenPoolRemote:destination",
              },
              () => destChain.getTokenPoolRemote(destPoolAddress, sourceChainSelector)
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

  // Sequential polling: wait for fetch to complete, then wait interval, then repeat
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
      await fetchRateLimits();
      if (!cancelled) {
        timeoutRef.current = setTimeout(() => void pollOnce(), RATE_LIMIT_POLLING_INTERVAL_MS);
      }
    };

    // Start first poll after the interval (initial fetch already ran)
    timeoutRef.current = setTimeout(() => void pollOnce(), RATE_LIMIT_POLLING_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
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
