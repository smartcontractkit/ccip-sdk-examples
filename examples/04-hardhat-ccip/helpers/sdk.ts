/**
 * SDK helper functions for Hardhat tasks
 *
 * Reuses shared packages and wraps CCIP SDK operations
 * for convenient use in Hardhat tasks.
 */

import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { networkInfo } from "@chainlink/ccip-sdk";
import { NETWORKS, getChainIdForNetwork } from "@ccip-examples/shared-config";

/**
 * Create viem clients for a given network
 */
export function createClients(networkId: string) {
  const network = NETWORKS[networkId];
  if (!network) throw new Error(`Unknown network: ${networkId}`);

  const chainId = getChainIdForNetwork(networkId);
  if (chainId === undefined) throw new Error(`Not an EVM network: ${networkId}`);

  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) throw new Error("EVM_PRIVATE_KEY env var not set");

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http(network.rpcUrl);
  const chain = defineChain({
    id: chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
  });

  return {
    account,
    chain,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
}

/**
 * Get the CCIP router address for a network
 */
export function getRouterAddress(networkId: string): string {
  const network = NETWORKS[networkId];
  if (!network) throw new Error(`Unknown network: ${networkId}`);
  return network.routerAddress;
}

/**
 * Get the CCIP chain selector for a network
 */
export function getDestChainSelector(networkId: string): bigint {
  return networkInfo(networkId).chainSelector;
}
