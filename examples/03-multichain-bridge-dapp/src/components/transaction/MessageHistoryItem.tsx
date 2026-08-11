/**
 * One history row. Collapsed: route, status, receiver, time, messageId, explorer
 * links. Expanded: delivery detail and the destination execution receipt.
 */

import { useState, type ReactNode } from "react";
import {
  ExecutionState,
  getCCIPExplorerUrl,
  MessageStatus,
  type MessageSearchResult,
} from "@chainlink/ccip-sdk";
import {
  getExplorerTxUrl,
  getNetwork,
  getStatusDescription,
} from "@chainlink/ccip-examples-shared-config";
import {
  formatElapsedTime,
  formatRelativeTime,
  truncateAddress,
} from "@chainlink/ccip-examples-shared-utils";

import { useMessageDetail } from "../../hooks/useMessageDetail.js";
import styles from "./TransactionHistoryItem.module.css";

interface MessageHistoryItemProps {
  message: MessageSearchResult;
}

function getStatusInfo(status: string): { icon: ReactNode; colorClass: string; label: string } {
  switch (status) {
    case MessageStatus.Success:
      return { icon: "✓", colorClass: styles.success ?? "", label: "Success" };
    case MessageStatus.Failed:
      return { icon: "✕", colorClass: styles.failed ?? "", label: "Failed" };
    default:
      // Every other status is in-flight.
      return { icon: "…", colorClass: styles.pending ?? "", label: toTitle(status) };
  }
}

/** Explorer URL, or null when the network is not configured in this app. */
function explorerTxUrl(networkId: string, txHash: string): string | null {
  if (!getNetwork(networkId)) return null;
  return getExplorerTxUrl(networkId, txHash);
}

/** What the destination OffRamp recorded for the attempt. */
function executionStateLabel(state: ExecutionState): string {
  switch (state) {
    case ExecutionState.Success:
      return "Success";
    case ExecutionState.Failed:
      return "Failed";
    default:
      return "In progress";
  }
}

/** "SOURCE_FINALIZED" to "Source finalized". */
function toTitle(status: string): string {
  const lower = status.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function MessageHistoryItem({ message }: MessageHistoryItemProps) {
  const [expanded, setExpanded] = useState(false);
  const statusInfo = getStatusInfo(message.status);
  // The API returns a network id such as "ethereum-testnet-sepolia-base-1". Display
  // names and explorer URLs come from shared-config; the SDK's NetworkInfo has none.
  const sourceId = message.sourceNetworkInfo.name;
  const destId = message.destNetworkInfo.name;
  const { detail, isLoading, error } = useMessageDetail(message.messageId, destId, expanded);
  const sourceName = getNetwork(sourceId)?.name ?? sourceId;
  const destName = getNetwork(destId)?.name ?? destId;
  const sentAt = message.sendTimestamp ? new Date(message.sendTimestamp).getTime() : null;

  // No amount is shown: formatting one needs the token's decimals, and shared-config
  // stores addresses only, so it would cost a getTokenInfo per distinct token.
  // The search response omits the destination hash by design; it arrives on expansion.
  const destTxHash = detail?.receiptTransactionHash;

  // History covers every chain the wallet has ever used, which is a wider set
  // than the app configures. getExplorerTxUrl throws on an unconfigured network,
  // so a single message on such a chain would take down the whole list.
  const sourceTxUrl = explorerTxUrl(sourceId, message.sendTransactionHash);
  const destTxUrl = destTxHash ? explorerTxUrl(destId, destTxHash) : null;

  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <div className={styles.route}>
          <span className={styles.network}>{sourceName}</span>
          <span className={styles.arrow}>→</span>
          <span className={styles.network}>{destName}</span>
        </div>
        <div
          className={`${styles.status} ${statusInfo.colorClass}`}
          title={getStatusDescription(message.status)}
        >
          <span className={styles.statusIcon}>{statusInfo.icon}</span>
          <span>{statusInfo.label}</span>
        </div>
      </div>

      <div className={styles.details}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>To</span>
          <code className={styles.detailValue}>{truncateAddress(message.receiver, 6)}</code>
        </div>
        {sentAt !== null && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Sent</span>
            <span className={styles.detailValue}>{formatRelativeTime(sentAt)}</span>
          </div>
        )}
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Message</span>
          <code className={styles.detailValue}>{truncateAddress(message.messageId, 6)}</code>
        </div>

        <div className={styles.detailRow}>
          <button
            type="button"
            className={styles.expandToggle}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
        </div>

        {expanded && (
          <>
            {isLoading && (
              <div className={styles.detailRow}>
                <span className={styles.expandedNotice}>Loading…</span>
              </div>
            )}
            {error != null && (
              <div className={styles.detailRow}>
                <span className={styles.expandedNotice}>{error}</span>
              </div>
            )}
            {detail && (
              <>
                {detail.receiptTimestamp != null && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Delivered</span>
                    <span className={styles.detailValue}>
                      {formatRelativeTime(detail.receiptTimestamp * 1000)}
                    </span>
                  </div>
                )}
                {detail.deliveryTime != null && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Took</span>
                    <span className={styles.detailValue}>
                      {formatElapsedTime(Number(detail.deliveryTime))}
                    </span>
                  </div>
                )}
                {detail.offRamp != null && detail.offRamp !== "" && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>OffRamp</span>
                    <code className={styles.detailValue}>{truncateAddress(detail.offRamp, 6)}</code>
                  </div>
                )}
                {detail.readyForManualExecution && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Manual execution</span>
                    <span className={styles.detailValue}>Ready</span>
                  </div>
                )}
                {detail.executionState != null && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>On-chain state</span>
                    <span className={styles.detailValue}>
                      {executionStateLabel(detail.executionState)}
                    </span>
                  </div>
                )}
                {detail.executionError != null && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Revert</span>
                    <code className={styles.detailValue}>{detail.executionError}</code>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className={styles.links}>
        {sourceTxUrl && (
          <a href={sourceTxUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
            Source Tx
          </a>
        )}
        <a
          href={getCCIPExplorerUrl("msg", message.messageId)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          CCIP Explorer
        </a>
        {destTxUrl && (
          <a href={destTxUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
            Dest Tx
          </a>
        )}
      </div>
    </div>
  );
}
