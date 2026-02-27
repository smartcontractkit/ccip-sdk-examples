/**
 * CCIP message progress stepper with real-time polling.
 */

import { MessageStatus, getCCIPExplorerUrl } from "@chainlink/ccip-sdk";
import { useMessageStatus } from "@ccip-examples/shared-utils/hooks";
import { MESSAGE_STAGES } from "@ccip-examples/shared-config";
import { CheckIcon, XIcon } from "../icons/index.js";
import styles from "./MessageProgress.module.css";

export interface MessageProgressProps {
  messageId: string;
}

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

export function MessageProgress({ messageId }: MessageProgressProps) {
  const { status, description, isSuccess, isFailed, isPolling, destTxHash, elapsedTime, error } =
    useMessageStatus(messageId);

  const currentStage = getStageIndex(status);
  const isFinalStage = (index: number): boolean => index === MESSAGE_STAGES.length - 1;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Cross-Chain Progress</h3>
        {isPolling && <span className={styles.elapsed}>{elapsedTime}</span>}
      </div>

      <div className={styles.stepper}>
        {MESSAGE_STAGES.map((stage, index) => {
          const isCompleted = index < currentStage;
          const isCurrent = index === currentStage;
          const isPending = index > currentStage;
          const finalStage = isFinalStage(index);

          return (
            <div
              key={stage.id}
              className={[
                styles.step,
                isCompleted ? styles.completed : "",
                isCurrent ? styles.current : "",
                isPending ? styles.pending : "",
                finalStage && isFailed ? styles.failed : "",
                finalStage && isSuccess ? styles.success : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
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
              <div className={styles.circle}>
                {isCompleted ? (
                  <CheckIcon className={styles.icon} width={14} height={14} />
                ) : isCurrent && !finalStage ? (
                  <span className={styles.pulse} />
                ) : finalStage && isFailed ? (
                  <XIcon className={styles.icon} width={14} height={14} />
                ) : finalStage && isSuccess ? (
                  <CheckIcon className={styles.icon} width={14} height={14} />
                ) : (
                  <span className={styles.dot} />
                )}
              </div>
              <div className={styles.label}>
                <span className={styles.labelText}>{stage.label}</span>
                {isCurrent && !finalStage && (
                  <span className={styles.labelDesc}>{stage.description}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.status}>
        <p className={styles.description}>{description}</p>
        {error != null && error !== "" && <p className={styles.error}>{error}</p>}
      </div>

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
