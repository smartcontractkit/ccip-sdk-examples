/**
 * Lazy chain context — getChain(networkId) creates/caches chain on demand.
 * Uses shared createChain() factory so the family→constructor mapping
 * is defined once in shared-utils, not duplicated per example.
 */

import { createContext, useCallback, useMemo, useRef, type ReactNode } from "react";
import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import { NETWORKS } from "@ccip-examples/shared-config";
import { createChain, type ChainInstance } from "@ccip-examples/shared-utils";

export interface ChainContextValue {
  getChain: (networkId: string) => Promise<ChainInstance>;
  isEVM: (networkId: string) => boolean;
  isSolana: (networkId: string) => boolean;
  isAptos: (networkId: string) => boolean;
}

const ChainContext = createContext<ChainContextValue | null>(null);

export { ChainContext };

export function ChainContextProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, ChainInstance>>(new Map());

  const getChain = useCallback(async (networkId: string): Promise<ChainInstance> => {
    const cached = cacheRef.current.get(networkId);
    if (cached) return cached;

    const config = NETWORKS[networkId];
    if (!config) throw new Error(`Unknown network: ${networkId}`);

    const chain = (await createChain(networkId, config.rpcUrl)) as ChainInstance;
    cacheRef.current.set(networkId, chain);
    return chain;
  }, []);

  const isEVM = useCallback((networkId: string) => {
    if (!networkId) return false;
    return networkInfo(networkId).family === ChainFamily.EVM;
  }, []);

  const isSolana = useCallback((networkId: string) => {
    if (!networkId) return false;
    return networkInfo(networkId).family === ChainFamily.Solana;
  }, []);

  const isAptos = useCallback((networkId: string) => {
    if (!networkId) return false;
    return networkInfo(networkId).family === ChainFamily.Aptos;
  }, []);

  const value = useMemo<ChainContextValue>(
    () => ({ getChain, isEVM, isSolana, isAptos }),
    [getChain, isEVM, isSolana, isAptos]
  );

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}
