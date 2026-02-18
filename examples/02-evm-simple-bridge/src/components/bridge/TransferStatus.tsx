/**
 * Transfer status display
 *
 * Shows the current status of a transfer with appropriate styling.
 * Includes links to block explorer and CCIP explorer.
 */

import type { TransferStatus as TransferStatusType } from "../../hooks";
import { getCCIPExplorerUrl } from "@chainlink/ccip-sdk";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { truncateAddress } from "@ccip-examples/shared-utils";
import { Button } from "../ui";
import styles from "./TransferStatus.module.css";

interface TransferStatusProps {
  status: TransferStatusType;
  error: string | null;
  txHash: string | null;
  messageId: string | null;
  /** Estimated delivery time from getLaneLatency (e.g. "~17 min") */
  estimatedTime: string | null;
  /** Source network ID for explorer link */
  sourceNetworkId: string | null;
  /** Destination network ID for explorer link */
  destNetworkId: string | null;
  /** Destination transaction hash (from message status) */
  destTxHash: string | null;
  onReset: () => void;
}

/**
 * Status messages for each transfer state
 *
 * The SDK handles approvals and sending internally,
 * so we show a single "sending" state while wallet prompts appear.
 */
const STATUS_MESSAGES: Record<TransferStatusType, string> = {
  idle: "",
  estimating: "Estimating fee...",
  sending: "Sending transaction...",
  success: "Transfer initiated successfully!",
  failed: "Transfer failed",
};

/**
 * Detailed messages for sending state (wallet interaction)
 */
const SENDING_DETAILS =
  "Please confirm transaction(s) in your wallet. There may be multiple prompts (approval + send).";

export function TransferStatus({
  status,
  error,
  txHash,
  messageId,
  estimatedTime,
  sourceNetworkId,
  destNetworkId,
  destTxHash,
  onReset,
}: TransferStatusProps) {
  // Don't render if idle and no error
  if (status === "idle" && !error) {
    return null;
  }

  const isSuccess = status === "success";
  const isError = status === "failed" || Boolean(error);
  const isLoading = !isSuccess && !isError && status !== "idle";
  const isSending = status === "sending";

  // Determine container styling
  const containerClass = [
    styles.container,
    isSuccess ? styles.success : "",
    isError ? styles.error : "",
    isLoading ? styles.loading : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      <div className={styles.header}>
        {isLoading && <span className={styles.spinner} aria-hidden="true" />}
        <strong className={styles.statusText}>{STATUS_MESSAGES[status]}</strong>
      </div>

      {/* Detailed message for wallet interaction */}
      {isSending && <p className={styles.sendingDetails}>{SENDING_DETAILS}</p>}

      {error && <p className={styles.errorMessage}>{error}</p>}

      {/* Source Transaction (clickable) */}
      {txHash && sourceNetworkId && (
        <div className={styles.link}>
          <strong>Source Transaction: </strong>
          <a
            href={getExplorerTxUrl(sourceNetworkId, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.explorerLink}
          >
            {truncateAddress(txHash, 8)}
          </a>
        </div>
      )}

      {/* CCIP Message ID (clickable, truncated) */}
      {messageId && (
        <div className={styles.link}>
          <strong>CCIP Message: </strong>
          <a
            href={getCCIPExplorerUrl("msg", messageId)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.explorerLink}
          >
            {truncateAddress(messageId, 8)}
          </a>
        </div>
      )}

      {/* Destination Transaction (when available) */}
      {destTxHash && destNetworkId && (
        <div className={styles.link}>
          <strong>Destination Transaction: </strong>
          <a
            href={getExplorerTxUrl(destNetworkId, destTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.explorerLink}
          >
            {truncateAddress(destTxHash, 8)}
          </a>
        </div>
      )}

      {isSuccess && (
        <p className={styles.note}>
          {estimatedTime
            ? `Estimated delivery: ${estimatedTime}. Track progress below or on the CCIP Explorer.`
            : "Track cross-chain progress below or on the CCIP Explorer."}
        </p>
      )}

      {(isSuccess || isError) && (
        <div className={styles.resetButton}>
          <Button variant="secondary" onClick={onReset}>
            New Transfer
          </Button>
        </div>
      )}
    </div>
  );
}
