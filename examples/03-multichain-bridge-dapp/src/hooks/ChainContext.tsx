/**
 * Lazy chain context — getChain(networkId) creates/caches chain on demand.
 * Uses shared createChain() factory so the family→constructor mapping
 * is defined once in shared-utils, not duplicated per example.
 */

import { createContext, useCallback, useMemo, useRef, type ReactNode } from "react";
import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import type { SDKCallPhase } from "@ccip-examples/shared-utils/inspector";
import { NETWORKS, CHAIN_FAMILY_LABELS } from "@ccip-examples/shared-config";
import { createChain, obfuscateRpcUrl, type ChainInstance } from "@ccip-examples/shared-utils";
import { logSDKCall } from "../inspector/index.js";
import { getAnnotation } from "../inspector/annotations.js";

export interface ChainContextValue {
  getChain: (networkId: string, phase?: SDKCallPhase) => Promise<ChainInstance>;
  isEVM: (networkId: string) => boolean;
  isSolana: (networkId: string) => boolean;
  isAptos: (networkId: string) => boolean;
}

const ChainContext = createContext<ChainContextValue | null>(null);

export { ChainContext };

/** How long to suppress retries after a failed chain instantiation (ms) */
const ERROR_COOLDOWN_MS = 30_000;

interface FailedAttempt {
  error: Error;
  timestamp: number;
}

export function ChainContextProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, ChainInstance>>(new Map());
  const pendingRef = useRef<Map<string, Promise<ChainInstance>>>(new Map());
  const failedRef = useRef<Map<string, FailedAttempt>>(new Map());

  const getChain = useCallback(
    async (networkId: string, phase?: SDKCallPhase): Promise<ChainInstance> => {
      const cached = cacheRef.current.get(networkId);
      if (cached) return cached;

      // Deduplicate concurrent calls — return the in-flight promise if one exists
      const pending = pendingRef.current.get(networkId);
      if (pending) return pending;

      // If a recent attempt failed, throw immediately instead of hammering the RPC
      const failed = failedRef.current.get(networkId);
      if (failed && Date.now() - failed.timestamp < ERROR_COOLDOWN_MS) {
        throw failed.error;
      }

      const config = NETWORKS[networkId];
      if (!config) throw new Error(`Unknown network: ${networkId}`);

      const family = networkInfo(networkId).family;
      const familyLabel = CHAIN_FAMILY_LABELS[family];

      const promise = logSDKCall(
        {
          method: `createChain (${config.name})`,
          phase: phase ?? "setup",
          displayArgs: { networkId, rpcUrl: obfuscateRpcUrl(config.rpcUrl) },
          ...getAnnotation("createChain"),
        },
        async () => {
          const chain = await (createChain(networkId, config.rpcUrl) as Promise<ChainInstance>);
          // Attach a display-friendly name so serializeForDisplay doesn't show minified class names
          (chain as unknown as Record<string, unknown>).__displayName =
            `${familyLabel}Chain instance`;
          return chain;
        }
      ).then(
        (chain) => {
          failedRef.current.delete(networkId);
          cacheRef.current.set(networkId, chain);
          pendingRef.current.delete(networkId);
          return chain;
        },
        (err) => {
          const error = err instanceof Error ? err : new Error(String(err));
          failedRef.current.set(networkId, { error, timestamp: Date.now() });
          pendingRef.current.delete(networkId);
          throw error;
        }
      );

      pendingRef.current.set(networkId, promise);
      return promise;
    },
    []
  );

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
