/**
 * Fee estimate block: estimated fee (with symbol), delivery, "Your balance after" with checkmark.
 */

import type { FeeTokenOptionItem } from "@ccip-examples/shared-config";
import { formatAmount } from "@ccip-examples/shared-utils";
import styles from "./FeeEstimateDisplay.module.css";

export interface FeeEstimateDisplayProps {
  /** Fee amount in fee token's smallest unit */
  fee: bigint;
  /** Selected fee token (symbol, decimals for formatting) */
  feeToken: FeeTokenOptionItem | null;
  /** User's balance for the selected fee token */
  balance: bigint | null;
  /** e.g. "~17 min" from getLaneLatency */
  estimatedTime: string | null;
}

export function FeeEstimateDisplay({
  fee,
  feeToken,
  balance,
  estimatedTime,
}: FeeEstimateDisplayProps) {
  if (!feeToken) return null;

  const feeFormatted = `${formatAmount(fee, feeToken.decimals)} ${feeToken.symbol}`;
  const balanceAfter = balance !== null ? balance - fee : null;
  const balanceAfterFormatted =
    balanceAfter !== null
      ? `${formatAmount(balanceAfter, feeToken.decimals)} ${feeToken.symbol}`
      : "—";
  const hasEnough = balance !== null && balance >= fee;

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <span className={styles.label}>Estimated fee</span>
        <span className={styles.value}>{feeFormatted}</span>
      </div>
      {estimatedTime != null && estimatedTime !== "" && (
        <div className={styles.row}>
          <span className={styles.label}>Delivery</span>
          <span className={styles.value}>{estimatedTime}</span>
        </div>
      )}
      <div className={styles.row}>
        <span className={styles.label}>Your balance after</span>
        <span className={`${styles.value} ${hasEnough ? styles.valueOk : styles.valueWarning}`}>
          {balanceAfterFormatted}
          {balance !== null && (
            <span
              className={styles.check}
              aria-hidden={hasEnough}
              {...(!hasEnough && { "aria-label": "Insufficient balance", role: "img" as const })}
            >
              {hasEnough ? " ✓" : " ⚠"}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
