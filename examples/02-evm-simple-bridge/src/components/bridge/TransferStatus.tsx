/**
 * Transfer status display
 *
 * Shows the current status of a transfer with appropriate styling.
 * Includes links to block explorer and CCIP explorer.
 */

import type { TransferStatus as TransferStatusType } from "../../hooks";
import { getCCIPExplorerUrl } from "@chainlink/ccip-sdk";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { Button } from "../ui";
import styles from "./TransferStatus.module.css";

interface TransferStatusProps {
  status: TransferStatusType;
  error: string | null;
  txHash: string | null;
  messageId: string | null;
  sourceNetwork: string;
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
  sending: "Confirm transaction(s) in wallet...",
  success: "Transfer initiated successfully!",
  failed: "Transfer failed",
};

export function TransferStatus({
  status,
  error,
  txHash,
  messageId,
  sourceNetwork,
  onReset,
}: TransferStatusProps) {
  // Don't render if idle and no error
  if (status === "idle" && !error) {
    return null;
  }

  const isSuccess = status === "success";
  const isError = status === "failed" || Boolean(error);
  const isLoading = !isSuccess && !isError && status !== "idle";

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

      {error && <p className={styles.errorMessage}>{error}</p>}

      {txHash && (
        <div className={styles.link}>
          <strong>Transaction: </strong>
          <a
            href={getExplorerTxUrl(sourceNetwork, txHash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </a>
        </div>
      )}

      {messageId && (
        <div className={styles.link}>
          <strong>CCIP Message: </strong>
          <a href={getCCIPExplorerUrl("msg", messageId)} target="_blank" rel="noopener noreferrer">
            View on CCIP Explorer
          </a>
        </div>
      )}

      {isSuccess && (
        <p className={styles.note}>
          Cross-chain transfers typically take 15-30 minutes to complete. Track the status using the
          CCIP Explorer link above.
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
