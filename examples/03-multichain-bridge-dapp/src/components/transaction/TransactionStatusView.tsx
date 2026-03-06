/**
 * Unified "during transfer" view: header, error, message progress, live balances, rate limits, links, actions.
 * Replaces the split between TransferStatus and conditional MessageProgress in App.
 */

import { useCallback } from "react";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import type { CategorizedError, LastTransferContext } from "@ccip-examples/shared-utils";
import type { TransferStatusStatus } from "@ccip-examples/shared-utils";
import { useMessageStatus } from "@ccip-examples/shared-utils/hooks";
import { TransferStatus, MessageProgress, ErrorMessage } from "@ccip-examples/shared-components";
import { inspectorStore } from "../../inspector/index.js";
import { getAnnotation } from "../../inspector/annotations.js";
import { serializeForDisplay } from "@ccip-examples/shared-utils/inspector";
import { TransferBalances } from "./TransferBalances.js";
import { TransferRateLimits } from "./TransferRateLimits.js";
import styles from "./TransactionStatusView.module.css";

export interface TransactionStatusViewProps {
  status: TransferStatusStatus;
  error: string | null;
  txHash: string | null;
  messageId: string | null;
  estimatedTime: string | null;
  onReset: () => void;
  lastTransferContext: LastTransferContext | null | undefined;
  categorizedError: CategorizedError | null | undefined;
}

export function TransactionStatusView({
  status,
  error,
  txHash,
  messageId,
  estimatedTime,
  onReset,
  lastTransferContext,
  categorizedError,
}: TransactionStatusViewProps) {
  const onSDKCall = useCallback(
    (method: string, args: Record<string, string>, result?: unknown, durationMs?: number) => {
      if (!inspectorStore.getSnapshot().enabled) return;
      const ann = getAnnotation(method);
      // Polling: update existing entry in the SAME phase, or create new one
      const calls = inspectorStore.getSnapshot().calls;
      let existing = false;
      for (let i = calls.length - 1; i >= 0; i--) {
        const c = calls[i];
        if (c?.method === method && c.phase === "tracking") {
          existing = true;
          break;
        }
      }
      if (existing) {
        inspectorStore.updatePollingCall(
          method,
          {
            status: "success",
            result: serializeForDisplay(result),
            durationMs,
          },
          "tracking"
        );
      } else {
        inspectorStore.addCall({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          phase: "tracking",
          method,
          displayArgs: args,
          codeSnippet: ann.codeSnippet,
          annotation: ann.annotation,
          status: "success",
          result: serializeForDisplay(result),
          durationMs,
        });
      }
    },
    []
  );

  const messageStatus = useMessageStatus(messageId, { onSDKCall });
  const isFinal = messageStatus.isFinal;
  const destTxHash = messageStatus.destTxHash;

  if (status === "idle" && !error) return null;

  const showMessageBlock = status === "success" && messageId;
  const showBalancesAndLimits = showMessageBlock && lastTransferContext;

  return (
    <>
      {categorizedError && <ErrorMessage error={categorizedError} onDismiss={onReset} />}
      <TransferStatus
        status={status}
        error={categorizedError ? null : error}
        txHash={txHash}
        messageId={messageId}
        estimatedTime={estimatedTime}
        onReset={onReset}
      />
      {showMessageBlock && (
        <>
          <MessageProgress messageId={messageId} />
          {showBalancesAndLimits && (
            <>
              <TransferBalances
                sourceNetworkId={lastTransferContext.sourceNetworkId}
                destNetworkId={lastTransferContext.destNetworkId}
                senderAddress={lastTransferContext.senderAddress}
                receiverAddress={lastTransferContext.receiverAddress}
                tokenAddress={lastTransferContext.tokenAddress}
                remoteToken={lastTransferContext.remoteToken ?? null}
                isActive={!isFinal}
                tokenDecimals={lastTransferContext.tokenDecimals}
                destTokenDecimals={lastTransferContext.destTokenDecimals}
                initialSourceBalance={lastTransferContext.initialSourceBalance}
                initialDestBalance={lastTransferContext.initialDestBalance}
              />
              <TransferRateLimits
                sourceNetworkId={lastTransferContext.sourceNetworkId}
                destNetworkId={lastTransferContext.destNetworkId}
                tokenAddress={lastTransferContext.tokenAddress}
                isActive={!isFinal}
                tokenDecimals={lastTransferContext.tokenDecimals}
                destTokenDecimals={lastTransferContext.destTokenDecimals}
              />
            </>
          )}
          {destTxHash != null && destTxHash !== "" && lastTransferContext && (
            <div className={styles.destLink}>
              <strong>Destination transaction: </strong>
              <a
                href={getExplorerTxUrl(lastTransferContext.destNetworkId, destTxHash)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on explorer
              </a>
            </div>
          )}
        </>
      )}
    </>
  );
}
