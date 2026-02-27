/**
 * Network configurations for CCIP-supported chains
 *
 * Key design decisions:
 * - Keys are SDK-compatible networkIds (e.g., "ethereum-testnet-sepolia")
 * - chainId, chainSelector, chainFamily are NOT stored - fetch from SDK via networkInfo()
 * - Only essential config that can't be fetched from SDK is stored here
 * - RPC URLs come from getRpcUrl() (env vars RPC_<NETWORK_ID> or public fallbacks)
 *
 * @see https://docs.chain.link/ccip/directory/testnet
 */

import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import { getRpcUrl } from "./env.js";

export interface NativeCurrency {
  name: string;
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
    rpcUrl: getRpcUrl("ethereum-testnet-sepolia"),
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    routerAddress: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
  },

  "ethereum-testnet-sepolia-base-1": {
    name: "Base Sepolia",
    rpcUrl: getRpcUrl("ethereum-testnet-sepolia-base-1"),
    explorerUrl: "https://sepolia.basescan.org",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    routerAddress: "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93",
  },

  "avalanche-testnet-fuji": {
    name: "Avalanche Fuji",
    rpcUrl: getRpcUrl("avalanche-testnet-fuji"),
    explorerUrl: "https://testnet.snowtrace.io",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    routerAddress: "0xF694E193200268f9a4868e4Aa017A0118C9a8177",
  },

  "solana-devnet": {
    name: "Solana Devnet",
    rpcUrl: getRpcUrl("solana-devnet"),
    explorerUrl: "https://explorer.solana.com",
    nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
    routerAddress: "Ccip842gzYHhvdDkSyi2YVCoAWPbYJoApMFzSxQroE9C",
  },

  "aptos-testnet": {
    name: "Aptos Testnet",
    rpcUrl: getRpcUrl("aptos-testnet"),
    explorerUrl: "https://explorer.aptoslabs.com",
    nativeCurrency: { name: "Aptos Coin", symbol: "APT", decimals: 8 },
    routerAddress: "0xc748085bd02022a9696dfa2058774f92a07401208bbd34cfd0c6d0ac0287ee45",
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
 * Get all Aptos networks (uses SDK's networkInfo to determine chain family)
 */
export function getAptosNetworks(): [string, NetworkConfig][] {
  return Object.entries(NETWORKS).filter(([key]) => networkInfo(key).family === ChainFamily.Aptos);
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
  if (family === ChainFamily.Aptos) {
    return `${network.explorerUrl}/txn/${txHash}?network=testnet`;
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
  if (family === ChainFamily.Aptos) {
    return `${network.explorerUrl}/account/${address}?network=testnet`;
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

/**
 * EVM chain IDs for wagmi/viem (numeric chainId per network).
 * Used by example 03 wagmi config. Solana and other non-EVM networks return undefined.
 */
const EVM_CHAIN_IDS: Partial<Record<string, number>> = {
  "ethereum-testnet-sepolia": 11155111,
  "ethereum-testnet-sepolia-base-1": 84532,
  "avalanche-testnet-fuji": 43113,
};

/**
 * Get wagmi/viem chain ID for an EVM network.
 * Returns undefined for non-EVM networks (e.g. solana-devnet).
 */
export function getChainIdForNetwork(networkId: string): number | undefined {
  return EVM_CHAIN_IDS[networkId];
}
