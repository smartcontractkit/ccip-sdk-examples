/**
 * Environment-based RPC URL resolution (optional .env support).
 *
 * Checks both VITE_RPC_<NETWORK_ID> and RPC_<NETWORK_ID> env vars:
 * - VITE_RPC_* — for Vite browser apps (exposed via import.meta.env)
 * - RPC_* — for Node.js CLI scripts (exposed via process.env)
 *
 * Falls back to public RPC URLs so the app works without configuration.
 *
 * @see examples/03-multichain-bridge-dapp/.env.example
 */

export const SDK_NETWORK_IDS = [
  "ethereum-testnet-sepolia",
  "ethereum-testnet-sepolia-base-1",
  "avalanche-testnet-fuji",
  "solana-devnet",
  "aptos-testnet",
] as const;

export type SdkNetworkId = (typeof SDK_NETWORK_IDS)[number];

/** Public RPC fallbacks (work without API keys; may have rate limits) */
export const FALLBACK_RPC_URLS: Record<SdkNetworkId, string> = {
  "ethereum-testnet-sepolia": "https://ethereum-sepolia-rpc.publicnode.com",
  "ethereum-testnet-sepolia-base-1": "https://sepolia.base.org",
  "avalanche-testnet-fuji": "https://api.avax-test.network/ext/bc/C/rpc",
  "solana-devnet": "https://api.devnet.solana.com",
  "aptos-testnet": "https://fullnode.testnet.aptoslabs.com/v1",
};

/**
 * Convert SDK network ID to environment variable name suffix.
 * e.g. 'ethereum-testnet-sepolia' -> 'ETHEREUM_TESTNET_SEPOLIA'
 */
function toEnvSuffix(networkId: string): string {
  return networkId.toUpperCase().replace(/-/g, "_");
}

/** Read a value from import.meta.env (Vite) or process.env (Node.js). */
function getEnvValue(suffix: string): string | undefined {
  // Vite browser apps: import.meta.env.VITE_RPC_*
  try {
    const v = (import.meta as { env?: Record<string, string | undefined> }).env?.[
      `VITE_RPC_${suffix}`
    ];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  } catch {
    // import.meta.env not available
  }

  // Node.js CLI: process.env.RPC_*
  try {
    const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.[`RPC_${suffix}`];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  } catch {
    // process.env not available
  }

  return undefined;
}

/**
 * Environment variable name for a network's RPC URL (VITE_ prefix for Vite apps).
 * e.g. 'ethereum-testnet-sepolia' -> 'VITE_RPC_ETHEREUM_TESTNET_SEPOLIA'
 */
export function toRpcEnvVar(networkId: string): string {
  return `VITE_RPC_${toEnvSuffix(networkId)}`;
}

/**
 * RPC URL for a given SDK network ID.
 * Checks VITE_RPC_* then RPC_*; falls back to public endpoint.
 */
export function getRpcUrl(networkId: SdkNetworkId): string {
  const envValue = getEnvValue(toEnvSuffix(networkId));
  if (envValue) return envValue;
  return FALLBACK_RPC_URLS[networkId];
}
