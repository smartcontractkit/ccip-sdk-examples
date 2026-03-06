/**
 * Individual SDK call card with expand/collapse for code snippet and annotations.
 */

import { useState } from "react";
import type { SDKCallEntry } from "@ccip-examples/shared-utils/inspector";
import { CodeSnippet } from "./CodeSnippet.js";
import { PollingIndicator } from "./PollingIndicator.js";
import styles from "./CallEntry.module.css";

interface CallEntryProps {
  entry: SDKCallEntry;
}

/** Keys to show as inline badges in collapsed header (order matters) */
const BADGE_KEYS = ["side", "token", "type"] as const;

/** Skip raw addresses and long strings — badges should be short human-readable labels */
function isBadgeWorthy(value: string): boolean {
  return value.length <= 20;
}

export function CallEntry({ entry }: CallEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const badges = BADGE_KEYS.map((key) => entry.displayArgs[key]).filter(
    (v): v is string => typeof v === "string" && v.length > 0 && isBadgeWorthy(v)
  );

  const statusClass =
    entry.status === "success"
      ? styles.success
      : entry.status === "error"
        ? styles.error
        : styles.pending;

  return (
    <div
      className={`${styles.entry} ${statusClass} ${entry.status === "pending" ? styles.pendingBorder : ""}`}
    >
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className={`${styles.statusDot} ${statusClass}`} aria-hidden="true" />
        <span className={styles.method}>
          {entry.method}
          {badges.map((badge) => (
            <span key={badge} className={styles.sideBadge}>
              {badge}
            </span>
          ))}
        </span>
        {entry.pollCount != null && entry.pollCount > 1 && (
          <PollingIndicator pollCount={entry.pollCount} />
        )}
        {entry.durationMs != null && (
          <span className={styles.duration}>
            {entry.durationMs < 1000
              ? `${Math.round(entry.durationMs)}ms`
              : `${(entry.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        <span className={`${styles.chevron} ${isExpanded ? styles.expanded : ""}`}>
          {isExpanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {isExpanded && (
        <div className={styles.body}>
          <div className={styles.annotation}>
            <p className={styles.annotationWhat}>{entry.annotation.what}</p>
            <p className={styles.annotationWhy}>{entry.annotation.whyNow}</p>
          </div>

          <CodeSnippet code={entry.codeSnippet} />

          {Object.keys(entry.displayArgs).length > 0 && (
            <div className={styles.args}>
              <span className={styles.argsLabel}>Arguments:</span>
              {Object.entries(entry.displayArgs)
                .filter(([key]) => !(BADGE_KEYS as readonly string[]).includes(key))
                .map(([key, val]) => (
                  <span key={key} className={styles.arg}>
                    <span className={styles.argKey}>{key}:</span>{" "}
                    <span className={styles.argVal}>{val}</span>
                  </span>
                ))}
            </div>
          )}

          {entry.result && (
            <div className={styles.result}>
              <span className={styles.resultLabel}>Result:</span>
              <pre className={styles.resultValue}>{entry.result}</pre>
            </div>
          )}

          {entry.error && (
            <div className={styles.errorResult}>
              <span className={styles.resultLabel}>Error:</span>
              <pre className={styles.resultValue}>{entry.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
