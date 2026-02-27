/**
 * Input validation utilities for CCIP SDK examples
 *
 * Uses existing utilities from viem and @solana/web3.js
 * instead of reinventing validation logic.
 * Uses ChainFamily from @chainlink/ccip-sdk (no custom chainType).
 */

import { isAddress, getAddress, parseUnits, formatUnits } from "viem";
import { PublicKey } from "@solana/web3.js";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import { ChainFamily } from "@chainlink/ccip-sdk";

/**
 * Validate an EVM address using viem's isAddress
 */
export function isValidEVMAddress(address: string): boolean {
  return isAddress(address);
}

/**
 * Validate a Solana address using @solana/web3.js PublicKey
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate an Aptos address using @aptos-labs/ts-sdk AccountAddress
 */
export function isValidAptosAddress(address: string): boolean {
  try {
    AccountAddress.from(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate an address for a specific chain family (SDK type).
 * Use networkInfo(networkId).family when you have a network ID.
 */
export function isValidAddress(address: string, family: ChainFamily): boolean {
  if (family === ChainFamily.EVM) {
    return isValidEVMAddress(address);
  }
  if (family === ChainFamily.Solana) {
    return isValidSolanaAddress(address);
  }
  if (family === ChainFamily.Aptos) {
    return isValidAptosAddress(address);
  }
  return false;
}

/**
 * Get checksummed EVM address using viem's getAddress
 */
export function checksumAddress(address: string): string {
  return getAddress(address);
}

/**
 * Validate a positive number amount string
 */
export function isValidAmount(amount: string): boolean {
  if (!amount || amount.trim() === "") {
    return false;
  }

  // Must be a valid positive number
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    return false;
  }

  // Check for valid decimal format
  const decimalRegex = /^\d+(\.\d+)?$/;
  return decimalRegex.test(amount.trim());
}

/**
 * Validate amount doesn't exceed balance
 */
export function isAmountWithinBalance(amount: string, balance: bigint, decimals: number): boolean {
  if (!isValidAmount(amount)) {
    return false;
  }

  const parsedAmount = parseAmount(amount, decimals);
  return parsedAmount <= balance;
}

/**
 * Parse amount string to bigint using viem's parseUnits
 */
export function parseAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

/**
 * Format bigint to a human-readable display string.
 *
 * - Truncates to `maxDisplay` decimal places (default 4)
 * - Removes trailing zeros
 * - Adds thousand separators (e.g. 924,014.867)
 *
 * For full-precision strings (e.g. Max button input), use {@link formatAmountFull}.
 */
export function formatAmount(amount: bigint, decimals: number, maxDisplay = 4): string {
  const raw = formatUnits(amount, decimals);
  const [intPart = "0", fracPart] = raw.split(".");

  // Add thousand separators to integer part
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (!fracPart) return intFormatted;

  // Truncate to maxDisplay decimals, then strip trailing zeros
  const truncated = fracPart.slice(0, maxDisplay).replace(/0+$/, "");
  return truncated ? `${intFormatted}.${truncated}` : intFormatted;
}

/**
 * Format bigint to full-precision string (no truncation, no separators).
 * Use for input fields and Max button where exact value matters.
 */
export function formatAmountFull(amount: bigint, decimals: number): string {
  return formatUnits(amount, decimals);
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) {
    return address;
  }
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
