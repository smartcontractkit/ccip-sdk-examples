/**
 * Rate limit visualization (capacity bar + refill rate).
 */

import { type RateLimitBucket, formatRateLimitBucket } from "@ccip-examples/shared-utils";
import styles from "./RateLimitDisplay.module.css";

interface RateLimitDisplayProps {
  bucket: RateLimitBucket | null;
  label: string;
  decimals?: number;
  symbol?: string;
}

export function RateLimitDisplay({
  bucket,
  label,
  decimals = 18,
  symbol = "tokens",
}: RateLimitDisplayProps) {
  const formatted = formatRateLimitBucket(bucket, decimals);

  if (!formatted || !bucket?.isEnabled) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.label}>{label} Rate Limit</span>
          <span className={styles.disabled}>Not enabled</span>
        </div>
      </div>
    );
  }

  const getColorClass = (pct: number) => {
    if (pct >= 50) return styles.green;
    if (pct >= 20) return styles.yellow;
    return styles.red;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.label}>{label} Capacity</span>
        <span className={styles.value}>
          {formatted.current}/{formatted.max} {symbol}
        </span>
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-valuenow={formatted.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} capacity: ${formatted.percentage}% available`}
      >
        <div
          className={`${styles.progressBar} ${getColorClass(formatted.percentage)}`}
          style={{ width: `${Math.min(formatted.percentage, 100)}%` }}
        />
      </div>
      <div className={styles.footer}>
        <span className={`${styles.percentage} ${getColorClass(formatted.percentage)}`}>
          {formatted.percentage}% available
        </span>
        <span className={styles.refillRate}>Refill: {formatted.rate}</span>
      </div>
    </div>
  );
}
