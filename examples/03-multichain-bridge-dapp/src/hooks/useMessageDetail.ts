/**
 * Detail for one message, fetched when its history row is expanded.
 *
 * The search endpoint is deliberately lightweight, so fields such as
 * receiptTransactionHash live on /v2/messages/{messageId} instead. Fetching
 * per expanded row keeps the list to one request per page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CCIPAPIClient, type Chain, type ExecutionState } from "@chainlink/ccip-sdk";
import { getNetwork } from "@chainlink/ccip-examples-shared-config";
import { formatExecutionError } from "@chainlink/ccip-examples-shared-utils";

import { logSDKCall } from "../inspector/index.js";
import { getAnnotation } from "../inspector/annotations.js";
import { useChains } from "./useChains.js";

export interface MessageDetail {
  receiptTransactionHash?: string;
  receiptTimestamp?: number;
  deliveryTime?: bigint;
  offRamp?: string;
  readyForManualExecution: boolean;
  /** On-chain state of the execution attempt the API points at. */
  executionState?: ExecutionState;
  /** Revert reason the SDK decoded from that attempt, when it failed. */
  executionError?: string;
}

export interface UseMessageDetailResult {
  detail: MessageDetail | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Execution state and revert reason for one attempt, or null when the
 * destination chain cannot be reached. A missing receipt must not break the row.
 */
async function readExecutionReceipt(
  getChain: (networkId: string) => Promise<Chain>,
  destNetworkId: string,
  txHash: string,
  messageId: string
): Promise<Pick<MessageDetail, "executionState" | "executionError"> | null> {
  try {
    const destChain = await getChain(destNetworkId);
    const receipts = await logSDKCall(
      {
        method: "chain.getExecutionReceiptsInTx",
        phase: "tracking",
        displayArgs: { txHash, messageId },
        ...getAnnotation("chain.getExecutionReceiptsInTx"),
      },
      () => destChain.getExecutionReceiptsInTx(txHash, { messageId })
    );
    const execution = receipts[0];
    if (!execution) return null;
    return {
      executionState: execution.receipt.state,
      executionError: execution.error ? formatExecutionError(execution.error) : undefined,
    };
  } catch {
    return null;
  }
}

export function useMessageDetail(
  messageId: string,
  destNetworkId: string,
  enabled: boolean
): UseMessageDetailResult {
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<CCIPAPIClient | null>(null);
  const fetchIdRef = useRef(0);
  const { getChain } = useChains();

  const apiClient = useMemo(() => {
    clientRef.current ??= new CCIPAPIClient();
    return clientRef.current;
  }, []);

  const fetchDetail = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    const isCurrent = () => fetchId === fetchIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const request = await logSDKCall(
        {
          method: "CCIPAPIClient.getMessageById",
          phase: "tracking",
          displayArgs: { messageId },
          ...getAnnotation("CCIPAPIClient.getMessageById"),
        },
        () => apiClient.getMessageById(messageId)
      );
      const m = request.metadata;
      const base: MessageDetail = {
        receiptTransactionHash: m.receiptTransactionHash,
        receiptTimestamp: m.receiptTimestamp,
        deliveryTime: m.deliveryTime,
        offRamp: m.offRamp,
        readyForManualExecution: m.readyForManualExecution,
      };
      if (!isCurrent()) return;
      setDetail(base);

      // The API reports a status; the receipt is what the destination chain
      // recorded, including the decoded revert reason on a failure.
      if (base.receiptTransactionHash && getNetwork(destNetworkId)) {
        const receipt = await readExecutionReceipt(
          getChain,
          destNetworkId,
          base.receiptTransactionHash,
          messageId
        );
        if (receipt && isCurrent()) setDetail({ ...base, ...receipt });
      }
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "Could not load message detail");
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [apiClient, messageId, destNetworkId, getChain]);

  // Drop a previous message's detail rather than relying on the row being
  // remounted by its key.
  useEffect(() => {
    setDetail(null);
    setError(null);
  }, [messageId, destNetworkId]);

  useEffect(() => {
    if (!enabled || detail || isLoading) return;
    void fetchDetail();
  }, [enabled, detail, isLoading, fetchDetail]);

  return { detail, isLoading, error };
}
