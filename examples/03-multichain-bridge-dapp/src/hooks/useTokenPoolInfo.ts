/**
 * Token pool info (rate limits, remote token) via CCIP SDK.
 * Uses getChain from context, NETWORKS and networkInfo from shared-config/SDK.
 */

import { useState, useEffect, useCallback } from "react";
import { networkInfo } from "@chainlink/ccip-sdk";
import type { RateLimiterState } from "@chainlink/ccip-sdk";
import { NETWORKS } from "@ccip-examples/shared-config";
import type { RateLimitBucket } from "@ccip-examples/shared-utils";
import { useChains } from "./useChains.js";
import { logSDKCall } from "../inspector/index.js";
import { getAnnotation } from "../inspector/annotations.js";

export type { RateLimitBucket };

function toRateLimitBucket(state: RateLimiterState): RateLimitBucket | null {
  if (!state) return null;
  return {
    tokens: state.tokens,
    capacity: state.capacity,
    rate: state.rate,
    isEnabled: true,
  };
}

export interface TokenPoolInfo {
  poolAddress: string;
  typeAndVersion: string;
  remoteToken: string | null;
  remotePools: string[];
  inboundRateLimit: RateLimitBucket | null;
  outboundRateLimit: RateLimitBucket | null;
}

export interface UseTokenPoolInfoResult {
  poolInfo: TokenPoolInfo | null;
  poolAddress: string | null;
  remoteToken: string | null;
  isLaneSupported: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTokenPoolInfo(
  sourceNetworkId: string | undefined,
  destNetworkId: string | undefined,
  tokenAddress: string | undefined,
  tokenSymbol?: string
): UseTokenPoolInfoResult {
  const { getChain } = useChains();
  const [poolInfo, setPoolInfo] = useState<TokenPoolInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPoolInfo = useCallback(async () => {
    if (!sourceNetworkId || !destNetworkId || !tokenAddress) {
      setPoolInfo(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const sourceConfig = NETWORKS[sourceNetworkId];
    const destChainSelector = networkInfo(destNetworkId).chainSelector;

    if (!sourceConfig || !destChainSelector) {
      setError("Invalid network configuration");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const chain = await getChain(sourceNetworkId);
      const router = sourceConfig.routerAddress;

      const registryAddress = await logSDKCall(
        {
          method: "chain.getTokenAdminRegistryFor",
          phase: "setup",
          displayArgs: { routerAddress: router, token: tokenSymbol ?? "token", side: "source" },
          ...getAnnotation("chain.getTokenAdminRegistryFor"),
        },
        () => chain.getTokenAdminRegistryFor(router)
      );
      const tokenConfig = await logSDKCall(
        {
          method: "chain.getRegistryTokenConfig",
          phase: "setup",
          displayArgs: {
            registryAddress: String(registryAddress),
            tokenAddress,
            token: tokenSymbol ?? "token",
            side: "source",
          },
          ...getAnnotation("chain.getRegistryTokenConfig"),
        },
        () => chain.getRegistryTokenConfig(registryAddress, tokenAddress)
      );
      const poolAddress = tokenConfig.tokenPool;

      if (!poolAddress) {
        setError("No token pool found for this token");
        setPoolInfo(null);
        setIsLoading(false);
        return;
      }

      const poolConfig = await logSDKCall(
        {
          method: "chain.getTokenPoolConfig",
          phase: "setup",
          displayArgs: { poolAddress, token: tokenSymbol ?? "token", side: "source" },
          ...getAnnotation("chain.getTokenPoolConfig"),
        },
        () => chain.getTokenPoolConfig(poolAddress)
      );
      const typeAndVersion =
        "typeAndVersion" in poolConfig && typeof poolConfig.typeAndVersion === "string"
          ? poolConfig.typeAndVersion
          : "Unknown";

      let remoteToken: string | null = null;
      let remotePools: string[] = [];
      let inboundRateLimit: RateLimitBucket | null = null;
      let outboundRateLimit: RateLimitBucket | null = null;

      try {
        const remote = await logSDKCall(
          {
            method: "chain.getTokenPoolRemote",
            phase: "setup",
            displayArgs: {
              poolAddress,
              destChainSelector: String(destChainSelector),
              token: tokenSymbol ?? "token",
              side: "source",
            },
            ...getAnnotation("chain.getTokenPoolRemote"),
          },
          () => chain.getTokenPoolRemote(poolAddress, destChainSelector)
        );
        remoteToken = remote.remoteToken;
        remotePools = remote.remotePools;
        inboundRateLimit = toRateLimitBucket(remote.inboundRateLimiterState);
        outboundRateLimit = toRateLimitBucket(remote.outboundRateLimiterState);
      } catch {
        // Lane not supported
      }

      setPoolInfo({
        poolAddress,
        typeAndVersion,
        remoteToken,
        remotePools,
        inboundRateLimit,
        outboundRateLimit,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch pool info";
      setError(message);
      setPoolInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [sourceNetworkId, destNetworkId, tokenAddress, getChain]);

  useEffect(() => {
    void fetchPoolInfo();
  }, [fetchPoolInfo]);

  const isLaneSupported =
    poolInfo !== null && (poolInfo.remoteToken !== null || poolInfo.remotePools.length > 0);

  return {
    poolInfo,
    poolAddress: poolInfo?.poolAddress ?? null,
    remoteToken: poolInfo?.remoteToken ?? null,
    isLaneSupported,
    isLoading,
    error,
    refetch: () => void fetchPoolInfo(),
  };
}
