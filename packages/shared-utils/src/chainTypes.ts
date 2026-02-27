/**
 * Chain instance type and type guards for CCIP SDK chains.
 * Shared across examples that use EVM and/or Solana.
 */

import { EVMChain, SolanaChain, AptosChain } from "@chainlink/ccip-sdk";

export type ChainInstance = EVMChain | SolanaChain | AptosChain;

export function isEVMChain(chain: ChainInstance): chain is EVMChain {
  return chain instanceof EVMChain;
}

export function isSolanaChain(chain: ChainInstance): chain is SolanaChain {
  return chain instanceof SolanaChain;
}

export function isAptosChain(chain: ChainInstance): chain is AptosChain {
  return chain instanceof AptosChain;
}
