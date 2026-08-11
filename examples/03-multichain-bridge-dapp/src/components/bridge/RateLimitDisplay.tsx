/**
 * Rate limit visualization (capacity bar + refill rate).
 *
 * Between polls the bar is advanced locally. The pool refills by
 * `rate * elapsed` capped at capacity (RateLimiter._calculateRefill), so this is
 * the same arithmetic the contract runs, not an estimate; each poll re-syncs it.
 */

import { useEffect, useRef, useState } from "react";
import {
  type RateLimitBucket,
  formatRateLimitBucket,
  refilledBucket,
} from "@chainlink/ccip-examples-shared-utils";
import styles from "./RateLimitDisplay.module.css";

/**
 * Re-renders about twice a second while the bucket is below capacity, so the bar
 * fills continuously instead of stepping on each poll.
 */
function useRefilling(bucket: RateLimitBucket | null): RateLimitBucket | null {
  const observedAt = useRef(Date.now());
  const [, tick] = useState(0);

  const key = bucket ? `${bucket.tokens}-${bucket.capacity}-${bucket.rate}` : "";
  useEffect(() => {
    observedAt.current = Date.now();
  }, [key]);

  const active = bucket !== null && bucket.isEnabled && bucket.tokens < bucket.capacity;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [active, key]);

  if (!bucket) return null;
  return refilledBucket(bucket, Date.now() - observedAt.current);
}

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
  const live = useRefilling(bucket);
  const formatted = formatRateLimitBucket(live, decimals);

  if (!formatted || !live?.isEnabled) {
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
