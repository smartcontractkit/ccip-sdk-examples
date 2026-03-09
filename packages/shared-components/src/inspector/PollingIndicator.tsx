/**
 * Visual indicator for repeated polling calls (e.g. getMessageById).
 */

import styles from "./CallEntry.module.css";

interface PollingIndicatorProps {
  pollCount: number;
}

export function PollingIndicator({ pollCount }: PollingIndicatorProps) {
  return (
    <span className={styles.pollBadge} title={`Polled ${pollCount} times`}>
      {pollCount}x
    </span>
  );
}
