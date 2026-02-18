/**
 * Hook for fetching CCIP lane latency
 *
 * Auto-fetches estimated delivery time when source/destination networks change.
 * Uses the SDK's getLaneLatency() method which provides estimated total delivery time
 * including source finality, DON processing, and destination execution.
 *
 * @example
 * ```tsx
 * const { latency, latencyFormatted, isLoading } = useLaneLatency(
 *   "ethereum-testnet-sepolia",
 *   "ethereum-testnet-sepolia-base-1"
 * );
 *
 * console.log(latencyFormatted); // "~17 min"
 * ```
 */

import { useState, useEffect, useCallback } from "react";
import { networkInfo } from "@chainlink/ccip-sdk";
import { formatLaneLatency } from "@ccip-examples/shared-utils";
import { getChainInstance } from "./useChain.js";

/**
 * Hook result
 */
export interface UseLaneLatencyResult {
  /** Lane latency in milliseconds */
  latency: number | null;
  /** Formatted latency for display (e.g., "~17 min") */
  latencyFormatted: string | null;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
}

/**
 * Hook for fetching lane latency
 *
 * @param sourceNetworkId - Source network ID (null to skip)
 * @param destNetworkId - Destination network ID (null to skip)
 */
export function useLaneLatency(
  sourceNetworkId: string | null,
  destNetworkId: string | null
): UseLaneLatencyResult {
  const [latency, setLatency] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch lane latency from SDK
   */
  const fetchLatency = useCallback(async () => {
    if (!sourceNetworkId || !destNetworkId) {
      setLatency(null);
      return;
    }

    // Don't fetch latency for same-chain transfers (no cross-chain involved)
    if (sourceNetworkId === destNetworkId) {
      setLatency(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use shared chain instance cache
      const chain = await getChainInstance(sourceNetworkId);

      const destChainSelector = networkInfo(destNetworkId).chainSelector;
      const laneLatency = await chain.getLaneLatency(destChainSelector);

      setLatency(laneLatency.totalMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch lane latency";
      setError(message);
      console.warn("Lane latency fetch error:", err);
      setLatency(null);
    } finally {
      setIsLoading(false);
    }
  }, [sourceNetworkId, destNetworkId]);

  /**
   * Fetch on mount and when dependencies change
   */
  useEffect(() => {
    void fetchLatency();
  }, [fetchLatency]);

  /**
   * Calculate formatted latency
   */
  const latencyFormatted = latency !== null ? formatLaneLatency(latency) : null;

  return {
    latency,
    latencyFormatted,
    isLoading,
    error,
  };
}
