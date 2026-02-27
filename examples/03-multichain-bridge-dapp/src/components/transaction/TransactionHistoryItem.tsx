/**
 * Single transaction row: route, amount, status, links.
 */

import type { ReactNode } from "react";
import { getCCIPExplorerUrl } from "@chainlink/ccip-sdk";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { truncateAddress } from "@ccip-examples/shared-utils";
import { formatRelativeTime } from "@ccip-examples/shared-utils";
import type { StoredTransaction } from "../../utils/localStorage.js";
import { NETWORKS } from "@ccip-examples/shared-config";
import styles from "./TransactionHistoryItem.module.css";

interface TransactionHistoryItemProps {
  transaction: StoredTransaction;
  onRemove?: (messageId: string) => void;
}

function getStatusInfo(status: StoredTransaction["status"]): {
  icon: ReactNode;
  colorClass: string;
  label: string;
} {
  switch (status) {
    case "success":
      return { icon: "✓", colorClass: styles.success ?? "", label: "Success" };
    case "failed":
      return { icon: "✕", colorClass: styles.failed ?? "", label: "Failed" };
    case "timeout":
      return { icon: "◷", colorClass: styles.timeout ?? "", label: "Timeout" };
    default:
      return { icon: "…", colorClass: styles.pending ?? "", label: "Pending" };
  }
}

export function TransactionHistoryItem({ transaction, onRemove }: TransactionHistoryItemProps) {
  const sourceConfig = NETWORKS[transaction.sourceNetwork];
  const destConfig = NETWORKS[transaction.destNetwork];
  const statusInfo = getStatusInfo(transaction.status);

  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <div className={styles.route}>
          <span className={styles.network}>{sourceConfig?.name ?? transaction.sourceNetwork}</span>
          <span className={styles.arrow}>→</span>
          <span className={styles.network}>{destConfig?.name ?? transaction.destNetwork}</span>
        </div>
        <div className={`${styles.status} ${statusInfo.colorClass}`}>
          <span className={styles.statusIcon}>{statusInfo.icon}</span>
          <span className={styles.statusLabel}>{statusInfo.label}</span>
        </div>
      </div>

      <div className={styles.amount}>
        <span className={styles.amountValue}>{transaction.amount}</span>
        <span className={styles.amountSymbol}>{transaction.tokenSymbol}</span>
      </div>

      <div className={styles.details}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>To</span>
          <code className={styles.detailValue}>{truncateAddress(transaction.receiver, 6)}</code>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Time</span>
          <span className={styles.detailValue}>{formatRelativeTime(transaction.timestamp)}</span>
        </div>
      </div>

      <div className={styles.links}>
        {transaction.txHash && (
          <a
            href={getExplorerTxUrl(transaction.sourceNetwork, transaction.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Source Tx
          </a>
        )}
        <a
          href={getCCIPExplorerUrl("msg", transaction.messageId)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          CCIP Explorer
        </a>
        {transaction.destTxHash && (
          <a
            href={getExplorerTxUrl(transaction.destNetwork, transaction.destTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Dest Tx
          </a>
        )}
      </div>

      {onRemove && (
        <button
          type="button"
          className={styles.removeButton}
          onClick={() => onRemove(transaction.messageId)}
          aria-label="Remove from history"
        >
          ✕
        </button>
      )}
    </div>
  );
}
