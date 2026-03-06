/**
 * Toggle button for the SDK Inspector panel.
 * Designed to be placed in Header's children slot.
 */

import { useSDKInspector, useSDKInspectorActions } from "@ccip-examples/shared-utils/inspector";
import styles from "./SDKInspectorToggle.module.css";

export function SDKInspectorToggle() {
  const { enabled, calls } = useSDKInspector();
  const { toggle } = useSDKInspectorActions();
  const pendingCount = calls.filter((c) => c.status === "pending").length;

  return (
    <button
      type="button"
      className={`${styles.toggle} ${enabled ? styles.active : ""}`}
      onClick={toggle}
      aria-expanded={enabled}
      aria-controls="sdk-inspector-panel"
      title={enabled ? "Hide SDK Inspector" : "Show SDK Inspector"}
      aria-label={enabled ? "Hide SDK Inspector" : "Show SDK Inspector"}
    >
      <span className={styles.icon} aria-hidden="true">
        {"</>"}
      </span>
      {!enabled && pendingCount > 0 && <span className={styles.badge}>{pendingCount}</span>}
    </button>
  );
}
