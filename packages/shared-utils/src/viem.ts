/**
 * Viem utilities for CCIP SDK integration
 *
 * Provides type-safe bridges between wagmi's typed clients and
 * the generic viem types expected by the CCIP SDK.
 *
 * @example
 * ```typescript
 * import { getPublicClient } from "wagmi/actions";
 * import { fromViemClient } from "@chainlink/ccip-sdk/viem";
 * import { toGenericPublicClient } from "@ccip-examples/shared-utils";
 *
 * const client = getPublicClient(wagmiConfig, { chainId });
 * const chain = await fromViemClient(toGenericPublicClient(client));
 * ```
 */

import type { Chain, PublicClient, Transport } from "viem";

/**
 * Converts wagmi's narrowly-typed PublicClient to the generic viem type
 * expected by the CCIP SDK's `fromViemClient()` adapter.
 *
 * ## Why this is needed
 *
 * wagmi's `getPublicClient()` returns a client typed with your specific
 * configured chains (e.g., `PublicClient<Transport, typeof sepolia>`).
 *
 * The CCIP SDK's `fromViemClient()` expects the broader generic type
 * `PublicClient<Transport, Chain>`.
 *
 * While functionally identical at runtime, TypeScript sees these as
 * incompatible types. This utility provides a type-safe cast.
 *
 * ## Type Safety
 *
 * This is a compile-time only operation - no runtime transformation occurs.
 * The function validates the input is truthy and returns it with the
 * correct type signature for SDK compatibility.
 *
 * @param client - The PublicClient from wagmi's getPublicClient()
 * @returns The same client typed as PublicClient<Transport, Chain>
 * @throws Error if client is null/undefined (wagmi config issue)
 *
 * @example
 * ```typescript
 * // In a React hook using wagmi
 * const getChainInstance = async (networkId: string) => {
 *   const chainId = NETWORK_TO_CHAIN_ID[networkId];
 *   const client = getPublicClient(wagmiConfig, { chainId });
 *   return fromViemClient(toGenericPublicClient(client));
 * };
 * ```
 */
export function toGenericPublicClient(client: unknown): PublicClient<Transport, Chain> {
  if (!client) {
    throw new Error("PublicClient is null/undefined. Check wagmi config and chainId.");
  }
  return client as PublicClient<Transport, Chain>;
}
