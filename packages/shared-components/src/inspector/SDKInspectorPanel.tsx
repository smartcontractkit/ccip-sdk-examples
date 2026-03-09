/**
 * Main SDK Inspector panel. Groups logged SDK calls by phase.
 * Desktop: fixed left panel. Mobile: bottom sheet.
 */

import { useMemo } from "react";
import {
  useSDKInspector,
  useSDKInspectorActions,
  type SDKCallPhase,
} from "@ccip-examples/shared-utils/inspector";
import { PhaseGroup } from "./PhaseGroup.js";
import { InspectorEmptyState } from "./InspectorEmptyState.js";
import styles from "./SDKInspectorPanel.module.css";

const PHASE_ORDER: SDKCallPhase[] = ["setup", "estimation", "transfer", "tracking"];

export function SDKInspectorPanel() {
  const { calls, activePhase } = useSDKInspector();
  const { clear } = useSDKInspectorActions();

  const groupedCalls = useMemo(() => {
    const groups = new Map<SDKCallPhase, typeof calls>();
    for (const call of calls) {
      const list = groups.get(call.phase) ?? [];
      list.push(call);
      groups.set(call.phase, list);
    }
    return groups;
  }, [calls]);

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

      <div className={styles.panelBody}>
        {phases.length === 0 ? (
          <InspectorEmptyState />
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
