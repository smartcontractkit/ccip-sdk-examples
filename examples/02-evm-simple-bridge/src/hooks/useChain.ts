/**
 * Shared chain instance cache and utilities
 *
 * PROBLEM: Without caching, each hook creates separate chain instances for
 * the same network:
 * - useTokenInfo x3 (native, BnM, LINK) = 3 instances
 * - useLaneLatency = 1 instance
 * - useTransfer = 1 instance
 * Total: 5 instances for ONE network!
 *
 * SOLUTION: Module-level cache shared across ALL hooks and components.
 * - Single chain instance per network
 * - Shared across entire app
 * - No unnecessary RPC handshakes
 *
 * @example
 * ```typescript
 * // In any hook:
 * const chain = await getChainInstance("ethereum-testnet-sepolia");
 * const balance = await chain.getBalance({ holder: address });
 * ```
 */

import { fromViemClient } from "@chainlink/ccip-sdk/viem";
import type { Chain } from "@chainlink/ccip-sdk";
import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import { getPublicClient } from "wagmi/actions";
import { NETWORKS } from "@ccip-examples/shared-config";
import { toGenericPublicClient } from "@ccip-examples/shared-utils";
import { wagmiConfig, NETWORK_TO_CHAIN_ID } from "../config/wagmi.js";

/**
 * Type for chain IDs configured in wagmi
 */
type ConfiguredChainId = (typeof wagmiConfig)["chains"][number]["id"];

/**
 * Module-level cache: networkId → Chain instance
 *
 * Shared across ALL hooks and components in the app.
 * This ensures we only create one chain instance per network.
 */
const chainCache = new Map<string, Chain>();

/**
 * Get (or create and cache) a chain instance for a network
 *
 * This is a module-level utility that maintains a global cache.
 * All hooks should use this instead of creating their own instances.
 *
 * @param networkId - SDK-compatible network ID
 * @returns Chain instance (cached)
 * @throws If network is not configured or not EVM
 *
 * @example
 * ```typescript
 * const chain = await getChainInstance("ethereum-testnet-sepolia");
 * const fee = await chain.getFee({ router, destChainSelector, message });
 * ```
 */
export async function getChainInstance(networkId: string): Promise<Chain> {
  // Check cache first
  const cached = chainCache.get(networkId);
  if (cached) {
    return cached;
  }

  // Validate network configuration
  const config = NETWORKS[networkId];
  if (!config) {
    throw new Error(`Network not configured: ${networkId}`);
  }

  // Validate it's an EVM network (this example is EVM-only)
  if (networkInfo(networkId).family !== ChainFamily.EVM) {
    throw new Error(`Only EVM networks are supported. Got: ${networkId}`);
  }

  // Verify network is configured in wagmi
  if (!(networkId in NETWORK_TO_CHAIN_ID)) {
    throw new Error(`Network not configured in wagmi: ${networkId}`);
  }

  const chainId = NETWORK_TO_CHAIN_ID[networkId] as ConfiguredChainId;

  // Create chain instance from wagmi public client
  const client = getPublicClient(wagmiConfig, { chainId });
  const chain = await fromViemClient(toGenericPublicClient(client));

  // Cache for future use
  chainCache.set(networkId, chain);

  return chain;
}

/**
 * Clear the chain cache
 *
 * Useful for testing or if you need to force recreation of chain instances.
 */
export function clearChainCache(): void {
  chainCache.clear();
}

/**
 * Get cache size (for debugging)
 */
export function getChainCacheSize(): number {
  return chainCache.size;
}
