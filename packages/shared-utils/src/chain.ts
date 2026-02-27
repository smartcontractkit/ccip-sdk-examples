/**
 * Chain Factory Utilities
 *
 * Provides a family-agnostic factory for creating Chain instances
 * from the SDK. This avoids duplicating the family→constructor switch
 * in every example script.
 */

import type { Chain, Logger } from "@chainlink/ccip-sdk";
import { EVMChain, SolanaChain, AptosChain, networkInfo, ChainFamily } from "@chainlink/ccip-sdk";

/**
 * Create a {@link Chain} instance from a network ID and RPC URL.
 *
 * Maps chain families to their concrete SDK constructors while
 * returning the base {@link Chain} type so downstream code stays
 * family-agnostic.
 *
 * @param networkId - SDK-compatible network identifier
 *   (e.g. `"ethereum-testnet-sepolia"`, `"solana-devnet"`)
 * @param rpcUrl - RPC endpoint URL for the network
 * @param logger - Optional logger passed to the SDK's ChainContext.
 *   When omitted the SDK defaults to `console`. Pass a custom logger
 *   (e.g. one that suppresses `debug`) to control verbosity.
 * @returns A Chain instance connected to the given network
 * @throws If the chain family is not yet supported
 *
 * @example
 * ```typescript
 * const chain = await createChain("ethereum-testnet-sepolia", rpcUrl);
 * const fee = await chain.getFee({ router, destChainSelector, message });
 * ```
 */
export async function createChain(
  networkId: string,
  rpcUrl: string,
  logger?: Logger
): Promise<Chain> {
  const family = networkInfo(networkId).family;
  const ctx = logger ? { logger } : undefined;

  switch (family) {
    case ChainFamily.Solana:
      return SolanaChain.fromUrl(rpcUrl, ctx);
    case ChainFamily.EVM:
      return EVMChain.fromUrl(rpcUrl, ctx);
    case ChainFamily.Aptos:
      return AptosChain.fromUrl(rpcUrl, ctx);
    default:
      throw new Error(`Chain family "${family}" is not yet supported in this example`);
  }
}

/**
 * Create a {@link Logger} with configurable verbosity.
 *
 * When `verbose` is `false`, `debug` calls are silently dropped.
 * All other levels (`info`, `warn`, `error`) always output.
 *
 * This logger can be passed to {@link createChain} so the SDK's
 * internal debug output respects the same verbosity flag.
 */
export function createLogger(verbose: boolean): Logger {
  return {
    debug: verbose ? console.debug.bind(console) : () => {},
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
}
