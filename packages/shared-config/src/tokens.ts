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
 * @see https://docs.chain.link/resources/link-token-contracts
 */

/**
 * Token addresses by networkId
 */
export type TokenAddresses = Record<string, string>;

/**
 * LINK token addresses per network.
 *
 * LINK is an ERC-677 token (18 decimals on EVM, 9 on Solana) used to pay
 * CCIP fees as an alternative to native currency.
 *
 * Sources:
 * - EVM testnets: https://docs.chain.link/resources/link-token-contracts
 * - Solana devnet: https://docs.chain.link/ccip/directory/testnet/chain/solana-devnet
 */
export const LINK_TOKEN_ADDRESSES: TokenAddresses = {
  "ethereum-testnet-sepolia": "0x779877A7B0D9E8603169DdbD7836e478b4624789",
  "ethereum-testnet-sepolia-base-1": "0xE4aB69C077896252FAFBD49EFD26B5D171A32410",
  "avalanche-testnet-fuji": "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846",
  "solana-devnet": "LinkhB3afbBKb2EQQu7s7umdZceV3wcvAUJhQAfQ23L",
} as const;

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
  LINK: LINK_TOKEN_ADDRESSES,
} as const;

/**
 * Fee token utilities (centralized for reuse across examples)
 */

/**
 * Supported fee token identifiers accepted by CLI scripts and UIs.
 *
 * - `"native"` — pay in the chain's native currency (ETH, SOL, AVAX, …)
 * - `"link"` — pay in LINK
 */
export type FeeTokenOption = "native" | "link";

/**
 * Fee token metadata for display in UIs
 */
export interface FeeTokenMetadata {
  /** Fee token option identifier */
  option: FeeTokenOption;
  /** Display symbol (e.g., "ETH", "LINK") */
  symbol: string;
  /** On-chain address (undefined for native) */
  address?: string;
  /** Whether this fee token is available on the network */
  available: boolean;
}

/**
 * Resolve a fee-token option to an on-chain address.
 *
 * @param option - `"native"` or `"link"`
 * @param networkId - SDK-compatible network ID
 * @returns The fee token address, or `undefined` for native
 * @throws If `"link"` is selected but no LINK address is configured for the network
 */
export function resolveFeeTokenAddress(
  option: FeeTokenOption,
  networkId: string
): string | undefined {
  if (option === "native") return undefined;

  const address = LINK_TOKEN_ADDRESSES[networkId];
  if (!address) {
    throw new Error(
      `LINK token address not configured for network "${networkId}". ` +
        `Add it to LINK_TOKEN_ADDRESSES in shared-config/tokens.ts.`
    );
  }
  return address;
}

/**
 * Get available fee token options for a network
 *
 * Returns metadata for all fee token options with availability status.
 * Useful for rendering fee token selectors in UIs.
 *
 * @param networkId - SDK-compatible network ID
 * @param nativeSymbol - Native currency symbol (e.g., "ETH", "AVAX")
 * @returns Array of fee token metadata
 *
 * @example
 * ```typescript
 * const options = getAvailableFeeTokens("ethereum-testnet-sepolia", "ETH");
 * // [
 * //   { option: "native", symbol: "ETH", available: true },
 * //   { option: "link", symbol: "LINK", address: "0x779...", available: true }
 * // ]
 * ```
 */
export function getAvailableFeeTokens(networkId: string, nativeSymbol: string): FeeTokenMetadata[] {
  const linkAddress = LINK_TOKEN_ADDRESSES[networkId];

  return [
    {
      option: "native",
      symbol: nativeSymbol,
      address: undefined,
      available: true,
    },
    {
      option: "link",
      symbol: "LINK",
      address: linkAddress,
      available: Boolean(linkAddress),
    },
  ];
}

/**
 * Check if a fee token option is available on a network
 *
 * @param option - Fee token option
 * @param networkId - SDK-compatible network ID
 * @returns True if the fee token is available
 */
export function isFeeTokenAvailable(option: FeeTokenOption, networkId: string): boolean {
  if (option === "native") return true;
  return Boolean(LINK_TOKEN_ADDRESSES[networkId]);
}

/**
 * Get token address for a specific network
 *
 * @param tokenKey - Token identifier (e.g., "CCIP-BnM", "LINK")
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
