/**
 * Composed hook: routes to useEVMTransfer, useSolanaTransfer, or useAptosTransfer by ChainFamily.
 */

import { useCallback } from "react";
import {
  isEVMChain,
  isSolanaChain,
  isAptosChain,
  type ChainInstance,
} from "@ccip-examples/shared-utils";
import { useEVMTransfer } from "./useEVMTransfer.js";
import { useSolanaTransfer } from "./useSolanaTransfer.js";
import { useAptosTransfer } from "./useAptosTransfer.js";
import type { TransactionResult, TransferMessage } from "./transferTypes.js";

export type { TransactionResult, TransferMessage } from "./transferTypes.js";

export interface UseTransactionExecutionParams {
  onStateChange: (state: "approving" | "sending" | "confirming" | "tracking") => void;
  onTxHash: (hash: string) => void;
  onMessageId: (id: string) => void;
}

export interface UseTransactionExecutionReturn {
  executeTransfer: (
    chain: ChainInstance,
    sourceNetworkId: string,
    destNetworkId: string,
    message: TransferMessage,
    fee: bigint
  ) => Promise<TransactionResult>;
}

export function useTransactionExecution({
  onStateChange,
  onTxHash,
  onMessageId,
}: UseTransactionExecutionParams): UseTransactionExecutionReturn {
  const { executeEVMTransfer } = useEVMTransfer({
    onStateChange,
    onTxHash,
    onMessageId,
  });
  const { executeSolanaTransfer } = useSolanaTransfer({
    onStateChange,
    onTxHash,
    onMessageId,
  });
  const { executeAptosTransfer } = useAptosTransfer({
    onStateChange,
    onTxHash,
    onMessageId,
  });

  const executeTransfer = useCallback(
    async (
      chain: ChainInstance,
      sourceNetworkId: string,
      destNetworkId: string,
      message: TransferMessage,
      fee: bigint
    ): Promise<TransactionResult> => {
      if (isEVMChain(chain)) {
        return executeEVMTransfer(chain, sourceNetworkId, destNetworkId, message, fee);
      }
      if (isSolanaChain(chain)) {
        return executeSolanaTransfer(chain, sourceNetworkId, destNetworkId, message, fee);
      }
      if (isAptosChain(chain)) {
        return executeAptosTransfer(chain, sourceNetworkId, destNetworkId, message, fee);
      }
      throw new Error("Unsupported chain type");
    },
    [executeEVMTransfer, executeSolanaTransfer, executeAptosTransfer]
  );

  return { executeTransfer };
}
