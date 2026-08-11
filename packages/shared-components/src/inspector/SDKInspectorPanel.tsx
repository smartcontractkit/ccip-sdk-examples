/**
 * Main SDK Inspector panel. Groups logged SDK calls by phase.
 * Desktop: fixed left panel. Mobile: bottom sheet.
 */

import { useMemo, useState } from "react";
import {
  useSDKInspector,
  useSDKInspectorActions,
  type SDKCallPhase,
} from "@chainlink/ccip-examples-shared-utils/inspector";
import { PhaseGroup } from "./PhaseGroup.js";
import { InspectorEmptyState } from "./InspectorEmptyState.js";
import styles from "./SDKInspectorPanel.module.css";

const PHASE_ORDER: SDKCallPhase[] = ["setup", "estimation", "transfer", "tracking"];

export function SDKInspectorPanel() {
  const { calls, activePhase } = useSDKInspector();
  const { clear } = useSDKInspectorActions();
  const [filter, setFilter] = useState("");

  // Matches the method and its argument values, so "0x9c35" finds one message's
  // polls and "fee" finds the quote.
  const visibleCalls = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return calls;
    return calls.filter(
      (call) =>
        call.method.toLowerCase().includes(needle) ||
        Object.values(call.displayArgs).some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [calls, filter]);

  const groupedCalls = useMemo(() => {
    const groups = new Map<SDKCallPhase, typeof calls>();
    for (const call of visibleCalls) {
      const list = groups.get(call.phase) ?? [];
      list.push(call);
      groups.set(call.phase, list);
    }
    return groups;
  }, [visibleCalls]);

  const phases = PHASE_ORDER.filter((p) => groupedCalls.has(p));

  return (
    <aside
      className={styles.panel}
      role="complementary"
      aria-label="SDK Inspector"
      id="sdk-inspector-panel"
    >
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{"</>"} SDK Inspector</h2>
        {calls.length > 0 && (
          <button type="button" className={styles.clearButton} onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {calls.length > 0 && (
        <div className={styles.filterRow}>
          <input
            type="search"
            className={styles.filterInput}
            placeholder="Filter calls"
            aria-label="Filter SDK calls"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}

      <div className={styles.panelBody}>
        {phases.length === 0 ? (
          filter.trim() ? (
            <p className={styles.noMatches}>No calls match “{filter.trim()}”.</p>
          ) : (
            <InspectorEmptyState />
          )
        ) : (
          phases.map((phase) => (
            <PhaseGroup
              key={phase}
              phase={phase}
              calls={groupedCalls.get(phase)!}
              isActive={phase === activePhase}
            />
          ))
        )}
      </div>
    </aside>
  );
}
