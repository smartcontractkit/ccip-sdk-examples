/**
 * Token address configurations
 *
 * Key design decisions:
 * - Only addresses are stored - metadata (decimals, name, symbol) fetched from SDK
 * - Keys are SDK-compatible networkIds
 * - Use chain.getTokenInfo(address) to get token metadata
 * - Use chain.getBalance({ holder, token }) to get balance
 *
 * @see https://docs.chain.link/ccip/directory/testnet/token
 */

/**
 * Token addresses by networkId
 */
export type TokenAddresses = Record<string, string>;

/**
 * CCIP Burn & Mint test token addresses
 *
 * This token uses a burn-and-mint mechanism:
 * - Burned on source chain
 * - Minted on destination chain
 *
 * Token metadata (symbol, name, decimals) should be fetched
 * on-chain using chain.getTokenInfo(address)
 */
export const CCIP_BNM_ADDRESSES: TokenAddresses = {
  "ethereum-testnet-sepolia": "0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05",
  "ethereum-testnet-sepolia-base-1": "0x88A2d74F47a237a62e7A51cdDa67270CE381555e",
  "avalanche-testnet-fuji": "0xD21341536c5cF5EB1bcb58f6723cE26e8D8E90e4",
  "solana-devnet": "3PjyGzj1jGVgHSKS4VR1Hr1memm63PmN8L9rtPDKwzZ6",
} as const;

/**
 * All supported token address mappings
 */
export const TOKEN_ADDRESSES: Record<string, TokenAddresses> = {
  "CCIP-BnM": CCIP_BNM_ADDRESSES,
} as const;

/**
 * Get token address for a specific network
 *
 * @param tokenKey - Token identifier (e.g., "CCIP-BnM")
 * @param networkId - Network identifier (e.g., "ethereum-testnet-sepolia")
 * @returns Token address or undefined if not found
 */
export function getTokenAddress(tokenKey: string, networkId: string): string | undefined {
  return TOKEN_ADDRESSES[tokenKey]?.[networkId];
}

/**
 * List of all supported token keys
 */
export const TOKEN_KEYS = Object.keys(TOKEN_ADDRESSES);
