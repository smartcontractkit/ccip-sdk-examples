/**
 * Family-agnostic wallet address resolution for multichain UIs.
 *
 * Centralises the networkId → family → address lookup so every
 * frontend doesn't need its own chain of if/else checks.
 */

import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";

/**
 * Map of connected wallet addresses keyed by chain family.
 * Each field is `null` when the wallet for that family is not connected.
 */
export interface WalletAddresses {
  evm: string | null;
  solana: string | null;
  aptos: string | null;
}

/**
 * Return the connected wallet address for a given network.
 *
 * Looks up the chain family for `networkId` via the SDK's
 * `networkInfo()` and returns the matching address from the
 * supplied map. Returns `null` when no network is selected or
 * the wallet for that family is not connected.
 *
 * @example
 * ```ts
 * const addr = getWalletAddress("aptos-testnet", { evm: evmAddr, solana: solAddr, aptos: aptosAddr });
 * ```
 */
export function getWalletAddress(
  networkId: string | null | undefined,
  addresses: WalletAddresses
): string | null {
  if (!networkId) return null;

  const family = networkInfo(networkId).family;

  switch (family) {
    case ChainFamily.EVM:
      return addresses.evm;
    case ChainFamily.Solana:
      return addresses.solana;
    case ChainFamily.Aptos:
      return addresses.aptos;
    default:
      return null;
  }
}

/**
 * Return a placeholder string for an address input on a given chain family.
 *
 * @example
 * ```ts
 * <Input placeholder={getAddressPlaceholder(destFamily)} />
 * ```
 */
export function getAddressPlaceholder(family: ChainFamily | null): string {
  if (family === ChainFamily.Solana) return "Solana address";
  // EVM and Aptos both use 0x-prefixed hex addresses
  return "0x...";
}
