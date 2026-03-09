/**
 * Empty state when no SDK calls have been logged.
 */

import styles from "./SDKInspectorPanel.module.css";

export function InspectorEmptyState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon} aria-hidden="true">
        {"</>"}
      </div>
      <p className={styles.emptyTitle}>No SDK calls yet</p>
      <p className={styles.emptyHint}>
        Estimate a fee or start a transfer to see SDK calls appear here in real-time.
      </p>
    </div>
  );
}
