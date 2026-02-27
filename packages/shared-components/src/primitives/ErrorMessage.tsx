/**
 * Displays a categorized error with message, optional recovery, and expandable details.
 */

import { useState, useCallback } from "react";
import type { CategorizedError as CategorizedErrorType } from "@ccip-examples/shared-utils";
import { copyToClipboard, COPIED_FEEDBACK_MS } from "@ccip-examples/shared-utils";
import { Button } from "./Button.js";
import styles from "./ErrorMessage.module.css";

export interface ErrorMessageProps {
  error: CategorizedErrorType;
  onDismiss?: () => void;
  showDetails?: boolean;
  className?: string;
}

const REPORT_ISSUE_URL = "https://github.com/smartcontractkit/ccip-sdk-examples/issues";

export function ErrorMessage({
  error,
  onDismiss,
  showDetails: showDetailsInitial = false,
  className = "",
}: ErrorMessageProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(showDetailsInitial);
  const [copied, setCopied] = useState(false);

  const hasDetails = error.rawErrorData != null || (error.details != null && error.details !== "");

  const handleCopyDetails = useCallback(() => {
    const text = error.rawErrorData ?? error.details ?? "";
    if (text) {
      copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    }
  }, [error.rawErrorData, error.details]);

  const severity = error.severity;
  const containerClass = [styles.container, className].filter(Boolean).join(" ");

  return (
    <div
      className={containerClass}
      role="alert"
      aria-live={severity === "error" ? "assertive" : "polite"}
      data-severity={severity}
    >
      {onDismiss && (
        <button
          type="button"
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
      <p className={styles.message}>{error.message}</p>
      {error.recovery != null && error.recovery !== "" && (
        <p className={styles.recovery}>{error.recovery}</p>
      )}

      {(hasDetails || error.category === "UNKNOWN_ERROR") && (
        <>
          <button
            type="button"
            className={styles.detailsToggle}
            onClick={() => setDetailsExpanded((v) => !v)}
          >
            {detailsExpanded ? "Hide" : "Show"} error details
          </button>
          {detailsExpanded && (
            <div className={styles.detailsContent}>
              {error.rawErrorData ?? error.details ?? "No details available"}
            </div>
          )}
          {detailsExpanded && (error.rawErrorData ?? error.details) && (
            <div className={styles.detailsActions}>
              <Button variant="secondary" onClick={handleCopyDetails} disabled={copied}>
                {copied ? "Copied!" : "Copy"}
              </Button>
              {error.category === "UNKNOWN_ERROR" && (
                <a
                  href={REPORT_ISSUE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.reportLink}
                >
                  Report issue
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
