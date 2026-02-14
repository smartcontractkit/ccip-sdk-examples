/**
 * Input validation utilities for CCIP SDK examples
 *
 * Uses existing utilities from viem and @solana/web3.js
 * instead of reinventing validation logic.
 */

import { isAddress, getAddress, parseUnits, formatUnits } from "viem";
import { PublicKey } from "@solana/web3.js";

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
 * Validate an address for a specific chain type
 */
export function isValidAddress(address: string, chainType: "evm" | "solana"): boolean {
  if (chainType === "evm") {
    return isValidEVMAddress(address);
  }
  return isValidSolanaAddress(address);
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
 * Format bigint to amount string using viem's formatUnits
 */
export function formatAmount(amount: bigint, decimals: number): string {
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
