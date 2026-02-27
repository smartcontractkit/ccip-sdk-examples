/**
 * Transfer status display with explorer links.
 */

import { getCCIPExplorerUrl } from "@chainlink/ccip-sdk";
import type { TransferStatusStatus } from "@ccip-examples/shared-utils";
import { Button } from "../primitives/Button.js";
import styles from "./TransferStatus.module.css";

const STATUS_MESSAGES: Record<TransferStatusStatus, string> = {
  idle: "",
  estimating: "Estimating fee...",
  sending: "Confirm transaction(s) in wallet...",
  success: "Transfer initiated successfully!",
  failed: "Transfer failed",
};

export interface TransferStatusProps {
  status: TransferStatusStatus;
  error: string | null;
  txHash: string | null;
  messageId: string | null;
  estimatedTime: string | null;
  onReset: () => void;
}

export function TransferStatus(props: TransferStatusProps) {
  const { status, error, txHash, messageId, estimatedTime, onReset } = props;
  if (status === "idle" && !error) return null;

  const isSuccess = status === "success";
  const isError = status === "failed" || Boolean(error);
  const isLoading = !isSuccess && !isError && status !== "idle";

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
      {error != null && error !== "" && <p className={styles.errorMessage}>{error}</p>}
      {txHash != null && txHash !== "" && (
        <div className={styles.link}>
          <strong>Transaction: </strong>
          <span>
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </span>
        </div>
      )}
      {messageId != null && messageId !== "" && (
        <div className={styles.link}>
          <strong>CCIP Message: </strong>
          <a href={getCCIPExplorerUrl("msg", messageId)} target="_blank" rel="noopener noreferrer">
            View on CCIP Explorer
          </a>
        </div>
      )}
      {isSuccess && (
        <p className={styles.note}>
          {estimatedTime != null && estimatedTime !== ""
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
