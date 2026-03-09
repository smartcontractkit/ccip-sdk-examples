/**
 * Collapsible phase section grouping SDK calls by lifecycle phase.
 */

import { useState, useEffect } from "react";
import type { SDKCallEntry, SDKCallPhase } from "@ccip-examples/shared-utils/inspector";
import { CallEntry } from "./CallEntry.js";
import styles from "./PhaseGroup.module.css";

const PHASE_LABELS: Record<SDKCallPhase, string> = {
  setup: "Setup",
  estimation: "Fee Estimation",
  transfer: "Transfer",
  tracking: "Tracking",
};

const PHASE_ICONS: Record<SDKCallPhase, string> = {
  setup: "\u2699",
  estimation: "\u{1F4B0}",
  transfer: "\u{1F680}",
  tracking: "\u{1F4E1}",
};

interface PhaseGroupProps {
  phase: SDKCallPhase;
  calls: SDKCallEntry[];
  isActive: boolean;
}

export function PhaseGroup({ phase, calls, isActive }: PhaseGroupProps) {
  const [isExpanded, setIsExpanded] = useState(isActive);

  useEffect(() => {
    if (isActive) setIsExpanded(true);
  }, [isActive]);

  const totalDuration = calls.reduce((sum, c) => sum + (c.durationMs ?? 0), 0);
  const hasErrors = calls.some((c) => c.status === "error");
  const hasPending = calls.some((c) => c.status === "pending");

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={`${styles.header} ${isActive ? styles.active : ""}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className={styles.icon} aria-hidden="true">
          {PHASE_ICONS[phase]}
        </span>
        <span className={styles.label}>{PHASE_LABELS[phase]}</span>
        <span className={styles.badge}>{calls.length}</span>
        {hasPending && <span className={styles.spinner} aria-label="In progress" />}
        {hasErrors && (
          <span className={styles.errorBadge} aria-label="Has errors">
            !
          </span>
        )}
        {totalDuration > 0 && !hasPending && (
          <span className={styles.totalDuration}>
            {totalDuration < 1000
              ? `${Math.round(totalDuration)}ms`
              : `${(totalDuration / 1000).toFixed(1)}s`}
          </span>
        )}
        <span className={`${styles.chevron} ${isExpanded ? styles.expanded : ""}`}>
          {isExpanded ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      <div className={`${styles.content} ${isExpanded ? styles.contentExpanded : ""}`}>
        <div className={styles.inner}>
          {calls.map((call) => (
            <CallEntry key={call.id} entry={call} />
          ))}
        </div>
      </div>
    </div>
  );
}
