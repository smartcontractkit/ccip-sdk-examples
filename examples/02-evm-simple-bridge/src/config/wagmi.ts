/**
 * Wagmi & RainbowKit Configuration
 *
 * WALLET INTEGRATION: This file configures EVM wallet connection
 * using RainbowKit (UI) + Wagmi (state management) + Viem (chain interaction).
 *
 * Key concepts:
 * 1. Chains - Define which EVM networks users can connect to
 * 2. Transports - How to communicate with each chain (HTTP RPC)
 * 3. Connectors - Wallet connection methods (injected, WalletConnect, etc.)
 *
 * NetworkId Mapping:
 * The SDK uses networkIds (e.g., "ethereum-testnet-sepolia") while wagmi uses
 * numeric chainIds (e.g., 11155111). This file bridges between the two.
 *
 * @see https://wagmi.sh/react/getting-started
 * @see https://www.rainbowkit.com/docs/installation
 */

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { sepolia, baseSepolia, avalancheFuji } from "wagmi/chains";
import { NETWORKS } from "@ccip-examples/shared-config";

/**
 * Custom chain configurations with our RPC URLs
 *
 * We override the default RPC URLs from wagmi/chains with
 * our configured endpoints for reliability.
 */
const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: { http: [NETWORKS["ethereum-testnet-sepolia"]?.rpcUrl ?? ""] },
  },
};

const customBaseSepolia = {
  ...baseSepolia,
  rpcUrls: {
    default: { http: [NETWORKS["ethereum-testnet-sepolia-base-1"]?.rpcUrl ?? ""] },
  },
};

const customAvalancheFuji = {
  ...avalancheFuji,
  rpcUrls: {
    default: { http: [NETWORKS["avalanche-testnet-fuji"]?.rpcUrl ?? ""] },
  },
};

/**
 * Wagmi Configuration
 *
 * getDefaultConfig() is a convenience function from RainbowKit that:
 * 1. Sets up the wagmi config with common defaults
 * 2. Configures RainbowKit-specific features
 * 3. Handles wallet connector setup (MetaMask, WalletConnect, etc.)
 *
 * For production:
 * - Get a project ID at https://cloud.walletconnect.com
 * - Add your app's metadata (name, description, url, icons)
 */
export const wagmiConfig = getDefaultConfig({
  appName: "CCIP Bridge Example",
  // Get a free project ID at https://cloud.walletconnect.com
  // Using a demo ID here - replace for production
  projectId: "ccip-sdk-example",
  chains: [customSepolia, customBaseSepolia, customAvalancheFuji],
  transports: {
    [sepolia.id]: http(NETWORKS["ethereum-testnet-sepolia"]?.rpcUrl),
    [baseSepolia.id]: http(NETWORKS["ethereum-testnet-sepolia-base-1"]?.rpcUrl),
    [avalancheFuji.id]: http(NETWORKS["avalanche-testnet-fuji"]?.rpcUrl),
  },
  ssr: false,
});

/**
 * Map chain ID to SDK networkId
 *
 * Bridges between wagmi's numeric chainId and SDK-compatible networkIds.
 * SDK networkIds are used for config lookup and API calls.
 */
export const CHAIN_ID_TO_NETWORK: Record<number, string> = {
  [sepolia.id]: "ethereum-testnet-sepolia",
  [baseSepolia.id]: "ethereum-testnet-sepolia-base-1",
  [avalancheFuji.id]: "avalanche-testnet-fuji",
};

/**
 * Map SDK networkId to wagmi chain ID
 *
 * Used when we need to switch chains or get wagmi clients for a network.
 * Returns undefined for unknown networkIds.
 */
export const NETWORK_TO_CHAIN_ID: Partial<Record<string, number>> = {
  "ethereum-testnet-sepolia": sepolia.id,
  "ethereum-testnet-sepolia-base-1": baseSepolia.id,
  "avalanche-testnet-fuji": avalancheFuji.id,
};

/**
 * Get wagmi chain object by SDK networkId
 */
export function getWagmiChain(networkId: string) {
  switch (networkId) {
    case "ethereum-testnet-sepolia":
      return customSepolia;
    case "ethereum-testnet-sepolia-base-1":
      return customBaseSepolia;
    case "avalanche-testnet-fuji":
      return customAvalancheFuji;
    default:
      return undefined;
  }
}
