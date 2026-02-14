/**
 * Network configurations for CCIP-supported chains
 *
 * Key design decisions:
 * - Keys are SDK-compatible networkIds (e.g., "ethereum-testnet-sepolia")
 * - chainId, chainSelector, chainFamily are NOT stored - fetch from SDK via networkInfo()
 * - Only essential config that can't be fetched from SDK is stored here
 *
 * @see https://docs.chain.link/ccip/directory/testnet
 */

import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";

export interface NativeCurrency {
  symbol: string;
  decimals: number;
}

export interface NetworkConfig {
  /** Human-readable network name */
  name: string;
  /** Default RPC URL (use custom via env vars in production) */
  rpcUrl: string;
  /** Block explorer URL */
  explorerUrl: string;
  /** Native currency (symbol + decimals only) */
  nativeCurrency: NativeCurrency;
  /** CCIP Router contract address */
  routerAddress: string;
}

/**
 * Supported networks
 *
 * Keys are SDK-compatible networkIds that can be used with:
 * - EVMChain.fromRpc(networkId, rpcUrl)
 * - SolanaChain.fromUrl(rpcUrl) with networkId
 * - CCIP API queries
 */
export const NETWORKS: Record<string, NetworkConfig> = {
  "ethereum-testnet-sepolia": {
    name: "Ethereum Sepolia",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    routerAddress: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
  },

  "ethereum-testnet-sepolia-base-1": {
    name: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    explorerUrl: "https://sepolia.basescan.org",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    routerAddress: "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93",
  },

  "avalanche-testnet-fuji": {
    name: "Avalanche Fuji",
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://testnet.snowtrace.io",
    nativeCurrency: { symbol: "AVAX", decimals: 18 },
    routerAddress: "0xF694E193200268f9a4868e4Aa017A0118C9a8177",
  },

  "solana-devnet": {
    name: "Solana Devnet",
    rpcUrl: "https://api.devnet.solana.com",
    explorerUrl: "https://explorer.solana.com",
    nativeCurrency: { symbol: "SOL", decimals: 9 },
    routerAddress: "Ccip842gzYHhvdDkSyi2YVCoAWPbYJoApMFzSxQroE9C",
  },
} as const;

/**
 * Get network configuration by networkId
 */
export function getNetwork(networkId: string): NetworkConfig | undefined {
  return NETWORKS[networkId];
}

/**
 * Get all EVM networks (uses SDK's networkInfo to determine chain family)
 */
export function getEVMNetworks(): [string, NetworkConfig][] {
  return Object.entries(NETWORKS).filter(([key]) => networkInfo(key).family === ChainFamily.EVM);
}

/**
 * Get all Solana networks (uses SDK's networkInfo to determine chain family)
 */
export function getSolanaNetworks(): [string, NetworkConfig][] {
  return Object.entries(NETWORKS).filter(([key]) => networkInfo(key).family === ChainFamily.Solana);
}

/**
 * Get block explorer transaction URL
 */
export function getExplorerTxUrl(networkId: string, txHash: string): string {
  const network = NETWORKS[networkId];
  if (!network) {
    throw new Error(`Unknown network: ${networkId}`);
  }

  const family = networkInfo(networkId).family;
  if (family === ChainFamily.Solana) {
    return `${network.explorerUrl}/tx/${txHash}?cluster=devnet`;
  }

  return `${network.explorerUrl}/tx/${txHash}`;
}

/**
 * Get block explorer address URL
 */
export function getExplorerAddressUrl(networkId: string, address: string): string {
  const network = NETWORKS[networkId];
  if (!network) {
    throw new Error(`Unknown network: ${networkId}`);
  }

  const family = networkInfo(networkId).family;
  if (family === ChainFamily.Solana) {
    return `${network.explorerUrl}/address/${address}?cluster=devnet`;
  }

  return `${network.explorerUrl}/address/${address}`;
}

/**
 * List of all supported network IDs
 */
export const NETWORK_IDS = Object.keys(NETWORKS);

/**
 * Get all networks as a list with key, name, and family for display
 */
export function getAllNetworks(): { key: string; name: string; family: ChainFamily }[] {
  return Object.entries(NETWORKS).map(([key, config]) => ({
    key,
    name: config.name,
    family: networkInfo(key).family,
  }));
}
