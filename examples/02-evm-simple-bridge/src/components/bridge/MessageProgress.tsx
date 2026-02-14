/**
 * CCIP Message Progress Stepper
 *
 * Visual stepper showing CCIP message lifecycle stages with
 * real-time polling and smooth CSS transitions.
 *
 * Stages:
 * 1. Submitted - Transaction on source chain
 * 2. Finalized - Source chain reached finality
 * 3. Committed - DON committed merkle root
 * 4. Blessed - Risk Management approved
 * 5. Executed - Message executed on destination
 */

import { MessageStatus, getCCIPExplorerUrl } from "@chainlink/ccip-sdk";
import { useMessageStatus } from "../../hooks";
import { MESSAGE_STAGES } from "@ccip-examples/shared-config";
import styles from "./MessageProgress.module.css";

interface MessageProgressProps {
  /** Source network ID for API calls */
  sourceNetwork: string;
  /** CCIP message ID to track */
  messageId: string;
}

/**
 * Map SDK MessageStatus to stage index (0-4)
 */
function getStageIndex(status: MessageStatus | null): number {
  if (!status) return 0;

  switch (status) {
    case MessageStatus.Sent:
      return 0;
    case MessageStatus.SourceFinalized:
      return 1;
    case MessageStatus.Committed:
    case MessageStatus.Blessed:
    case MessageStatus.Verifying:
    case MessageStatus.Verified:
      return 2;
    case MessageStatus.Success:
      return 4;
    case MessageStatus.Failed:
      return 4;
    default:
      return 0;
  }
}

export function MessageProgress({ sourceNetwork, messageId }: MessageProgressProps) {
  const {
    status,
    description,
    isFinal,
    isSuccess,
    isFailed,
    isPolling,
    destTxHash,
    elapsedTime,
    error,
  } = useMessageStatus(sourceNetwork, messageId);

  const currentStage = getStageIndex(status);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Cross-Chain Progress</h3>
        {isPolling && <span className={styles.elapsed}>{elapsedTime}</span>}
      </div>

      {/* Stepper */}
      <div className={styles.stepper}>
        {MESSAGE_STAGES.map((stage, index) => {
          const isCompleted = index < currentStage;
          const isCurrent = index === currentStage;
          const isPending = index > currentStage;
          const isFinalStage = index === MESSAGE_STAGES.length - 1;

          return (
            <div
              key={stage.id}
              className={[
                styles.step,
                isCompleted ? styles.completed : "",
                isCurrent ? styles.current : "",
                isPending ? styles.pending : "",
                isFinalStage && isFailed ? styles.failed : "",
                isFinalStage && isSuccess ? styles.success : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {/* Connector line (not on first step) */}
              {index > 0 && (
                <div
                  className={[
                    styles.connector,
                    isCompleted || isCurrent ? styles.connectorActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              )}

              {/* Step circle */}
              <div className={styles.circle}>
                {isCompleted ? (
                  <CheckIcon />
                ) : isCurrent && !isFinal ? (
                  <span className={styles.pulse} />
                ) : isFinalStage && isFailed ? (
                  <XIcon />
                ) : isFinalStage && isSuccess ? (
                  <CheckIcon />
                ) : (
                  <span className={styles.dot} />
                )}
              </div>

              {/* Step label */}
              <div className={styles.label}>
                <span className={styles.labelText}>{stage.label}</span>
                {isCurrent && !isFinal && (
                  <span className={styles.labelDesc}>{stage.description}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Status description */}
      <div className={styles.status}>
        <p className={styles.description}>{description}</p>
        {error && <p className={styles.error}>{error}</p>}
      </div>

      {/* Links */}
      <div className={styles.links}>
        <a
          href={getCCIPExplorerUrl("msg", messageId)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          {destTxHash ? "View Transaction Details" : "Track on CCIP Explorer"}
        </a>
      </div>
    </div>
  );
}

/** Check icon SVG */
function CheckIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** X icon SVG */
function XIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
