/**
 * Returns a stable getChain(networkId) for use with shared useWalletBalances.
 * Uses wagmi to get the public client and builds an SDK chain instance per network.
 * Chain instances are cached to avoid repeated RPC handshakes.
 */

import { useCallback, useRef } from "react";
import { fromViemClient } from "@chainlink/ccip-sdk/viem";
import type { Chain } from "@chainlink/ccip-sdk";
import { getPublicClient } from "wagmi/actions";
import { toGenericPublicClient } from "@ccip-examples/shared-utils";
import { wagmiConfig, NETWORK_TO_CHAIN_ID } from "@ccip-examples/shared-config/wagmi";

export function useGetChain(): (networkId: string) => Promise<Chain> {
  const chainCacheRef = useRef<Map<string, Chain>>(new Map());

  return useCallback(async (networkId: string): Promise<Chain> => {
    const cached = chainCacheRef.current.get(networkId);
    if (cached) return cached;

    const chainId = NETWORK_TO_CHAIN_ID[networkId];
    if (chainId === undefined) {
      throw new Error(`Network not configured: ${networkId}`);
    }
    const client = getPublicClient(wagmiConfig, { chainId });
    const chain = await fromViemClient(toGenericPublicClient(client));
    chainCacheRef.current.set(networkId, chain);
    return chain;
  }, []);
}
