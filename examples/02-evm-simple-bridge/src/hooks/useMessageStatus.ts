/**
 * Hook for tracking CCIP message status
 *
 * Polls the CCIP API via CCIPAPIClient to get real-time message status updates.
 * Uses incremental backoff to reduce API load while maintaining responsiveness.
 *
 * The CCIP API is a centralized index — a single call can locate any message
 * regardless of which chain it was sent from. No chain instance or RPC
 * connection is needed.
 *
 * CCIP Message Lifecycle (depends on lane version):
 *
 * V1 Lanes (COMMITTING & EXECUTING DON):
 * 1. SENT - Message submitted on source chain
 * 2. SOURCE_FINALIZED - Source chain reached finality
 * 3. COMMITTED - DON committed merkle root to destination
 * 4. BLESSED - Risk Management Network approved
 * 5. SUCCESS or FAILED - Final execution state
 *
 * V2 Lanes (Verifier architecture):
 * 1. SENT - Message submitted on source chain
 * 2. SOURCE_FINALIZED - Source chain reached finality
 * 3. VERIFYING - Verification in progress
 * 4. VERIFIED - All required verifiers (Chainlink/external) have verified
 * 5. SUCCESS or FAILED - Final execution state
 *
 * Note: A message will NEVER have both COMMITTED/BLESSED and VERIFYING/VERIFIED.
 * The lifecycle path depends on which lane version is deployed.
 *
 * @see https://docs.chain.link/ccip/concepts/message-lifecycle
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { CCIPAPIClient, MessageStatus } from "@chainlink/ccip-sdk";
import { POLLING_CONFIG } from "@ccip-examples/shared-config";

/**
 * Message status result from the hook
 */
export interface MessageStatusResult {
  /** Current message status from SDK (null if not yet fetched) */
  status: MessageStatus | null;
  /** Human-readable status description */
  description: string;
  /** Whether the message has reached a final state */
  isFinal: boolean;
  /** Whether the message succeeded */
  isSuccess: boolean;
  /** Whether the message failed */
  isFailed: boolean;
  /** Whether polling has timed out */
  isTimedOut: boolean;
  /** Whether currently polling */
  isPolling: boolean;
  /** Destination transaction hash (when executed) */
  destTxHash: string | null;
  /** Time elapsed since polling started */
  elapsedTime: string;
  /** Error if any occurred */
  error: string | null;
  /** Stop polling manually */
  stopPolling: () => void;
}

/**
 * Get human-readable description for a message status
 */
function getStatusDescription(status: MessageStatus | null): string {
  if (!status) return "Fetching status...";

  switch (status) {
    case MessageStatus.Sent:
      return "Message sent, waiting for source finality...";
    case MessageStatus.SourceFinalized:
      return "Source finalized, waiting for DON commit...";
    case MessageStatus.Committed:
      return "Committed to destination, waiting for blessing...";
    case MessageStatus.Blessed:
      return "Blessed by Risk Management, preparing execution...";
    case MessageStatus.Verifying:
      return "Verifying message...";
    case MessageStatus.Verified:
      return "Verified, executing on destination...";
    case MessageStatus.Success:
      return "Successfully executed on destination!";
    case MessageStatus.Failed:
      return "Execution failed on destination";
    default:
      return "Unknown status";
  }
}

/**
 * Check if status is a final state
 */
function isFinalStatus(status: MessageStatus | null): boolean {
  return status === MessageStatus.Success || status === MessageStatus.Failed;
}

/**
 * Format elapsed time as human-readable string
 */
function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Hook for tracking CCIP message status
 *
 * @param messageId - CCIP message ID to track (null to disable polling)
 * @returns Message status information and controls
 *
 * @example
 * ```tsx
 * const { status, description, isFinal } = useMessageStatus("0x1234...");
 *
 * if (isFinal) {
 *   console.log("Transfer complete:", status);
 * }
 * ```
 */
export function useMessageStatus(messageId: string | null): MessageStatusResult {
  const [status, setStatus] = useState<MessageStatus | null>(null);
  const [destTxHash, setDestTxHash] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Refs for polling control
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDelayRef = useRef<number>(POLLING_CONFIG.initialDelay);
  const shouldStopRef = useRef(false);

  // Stable API client ref — created once, reused across polls
  const apiClientRef = useRef<CCIPAPIClient | null>(null);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    shouldStopRef.current = true;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setIsPolling(false);
  }, []);

  /**
   * Fetch message status from CCIP API
   */
  const fetchStatus = useCallback(async () => {
    if (!messageId) return null;

    apiClientRef.current ??= new CCIPAPIClient();

    return apiClientRef.current.getMessageById(messageId);
  }, [messageId]);

  /**
   * Poll for status updates
   */
  const poll = useCallback(async () => {
    if (shouldStopRef.current) return;

    try {
      const request = await fetchStatus();

      if (!request?.metadata) {
        // Message not found yet - continue polling
        return;
      }

      const newStatus = request.metadata.status;
      setStatus(newStatus);

      // Update destination tx hash if available
      if (request.metadata.receiptTransactionHash) {
        setDestTxHash(request.metadata.receiptTransactionHash);
      }

      // Stop polling if final state reached
      if (isFinalStatus(newStatus)) {
        stopPolling();
        return;
      }
    } catch (err) {
      // Log error but continue polling (transient errors are common)
      console.warn("Status poll error:", err);
    }

    // Schedule next poll with incremental backoff
    // Re-check ref as it may have changed during async operations above
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can change async
    if (!shouldStopRef.current) {
      currentDelayRef.current = Math.min(
        currentDelayRef.current + POLLING_CONFIG.delayIncrement,
        POLLING_CONFIG.maxDelay
      );

      pollTimeoutRef.current = setTimeout(() => {
        void poll();
      }, currentDelayRef.current);
    }
  }, [fetchStatus, stopPolling]);

  /**
   * Start polling when messageId changes
   */
  useEffect(() => {
    if (!messageId) {
      // Reset state when no message to track
      setStatus(null);
      setDestTxHash(null);
      setIsPolling(false);
      setIsTimedOut(false);
      setError(null);
      setStartTime(null);
      setElapsedMs(0);
      return;
    }

    // Reset for new message
    shouldStopRef.current = false;
    currentDelayRef.current = POLLING_CONFIG.initialDelay;
    setStatus(null);
    setDestTxHash(null);
    setError(null);
    setIsTimedOut(false);
    setIsPolling(true);
    setStartTime(Date.now());

    // Start polling
    void poll();

    // Cleanup on unmount or message change
    return () => {
      stopPolling();
    };
  }, [messageId, poll, stopPolling]);

  /**
   * Update elapsed time and check for timeout
   */
  useEffect(() => {
    if (!isPolling || !startTime) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setElapsedMs(elapsed);

      // Check for timeout
      if (elapsed >= POLLING_CONFIG.timeout) {
        setIsTimedOut(true);
        setError("Status tracking timed out. Check CCIP Explorer for updates.");
        stopPolling();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPolling, startTime, stopPolling]);

  return {
    status,
    description: getStatusDescription(status),
    isFinal: isFinalStatus(status),
    isSuccess: status === MessageStatus.Success,
    isFailed: status === MessageStatus.Failed,
    isTimedOut,
    isPolling,
    destTxHash,
    elapsedTime: formatElapsedTime(elapsedMs),
    error,
    stopPolling,
  };
}
