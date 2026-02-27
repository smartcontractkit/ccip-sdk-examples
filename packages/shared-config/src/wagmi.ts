/**
 * Wagmi & RainbowKit configuration for EVM examples.
 * Import from "@ccip-examples/shared-config/wagmi" so the main entry stays wagmi-free (e.g. for Node/CLI).
 */

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import type { Config } from "wagmi";
import { sepolia, baseSepolia, avalancheFuji } from "wagmi/chains";
import type { Chain } from "viem";
import { NETWORKS } from "./networks.js";

const customSepolia: Chain = {
  ...sepolia,
  rpcUrls: {
    default: { http: [NETWORKS["ethereum-testnet-sepolia"]?.rpcUrl ?? ""] },
  },
};

const customBaseSepolia: Chain = {
  ...baseSepolia,
  rpcUrls: {
    default: { http: [NETWORKS["ethereum-testnet-sepolia-base-1"]?.rpcUrl ?? ""] },
  },
};

const customAvalancheFuji: Chain = {
  ...avalancheFuji,
  rpcUrls: {
    default: { http: [NETWORKS["avalanche-testnet-fuji"]?.rpcUrl ?? ""] },
  },
};

/** Chains array for reuse (e.g. RainbowKit getDefaultConfig) */
export const chains = [customSepolia, customBaseSepolia, customAvalancheFuji] as const;

/** Wagmi config. Cast from getDefaultConfig() to Config for strict ESLint (RainbowKit return type is weakly typed). */
// eslint-disable-next-line @typescript-eslint/no-unsafe-call -- RainbowKit getDefaultConfig() has unresolved typings
export const wagmiConfig = getDefaultConfig({
  appName: "CCIP Bridge Example",
  projectId: "ccip-sdk-example",
  chains: [...chains],
  transports: {
    [sepolia.id]: http(NETWORKS["ethereum-testnet-sepolia"]?.rpcUrl),
    [baseSepolia.id]: http(NETWORKS["ethereum-testnet-sepolia-base-1"]?.rpcUrl),
    [avalancheFuji.id]: http(NETWORKS["avalanche-testnet-fuji"]?.rpcUrl),
  },
  ssr: false,
}) as Config;

/** Map chain ID → SDK networkId */
export const CHAIN_ID_TO_NETWORK: Record<number, string> = {
  [sepolia.id]: "ethereum-testnet-sepolia",
  [baseSepolia.id]: "ethereum-testnet-sepolia-base-1",
  [avalancheFuji.id]: "avalanche-testnet-fuji",
};

/** Map SDK networkId → chain ID */
export const NETWORK_TO_CHAIN_ID: Partial<Record<string, number>> = {
  "ethereum-testnet-sepolia": sepolia.id,
  "ethereum-testnet-sepolia-base-1": baseSepolia.id,
  "avalanche-testnet-fuji": avalancheFuji.id,
};

export function getWagmiChain(networkId: string): Chain | undefined {
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
