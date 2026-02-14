/**
 * Hook for tracking CCIP message status
 *
 * Polls the CCIP API via the SDK to get real-time message status updates.
 * Uses exponential backoff to reduce API load while maintaining responsiveness.
 *
 * CCIP Message Lifecycle:
 * 1. SENT - Message submitted on source chain
 * 2. SOURCE_FINALIZED - Source chain reached finality
 * 3. COMMITTED - Merkle root committed to destination
 * 4. BLESSED - Risk Management Network approved
 * 5. VERIFYING/VERIFIED - Verification in progress/complete
 * 6. SUCCESS or FAILED - Final execution state
 *
 * @see https://docs.chain.link/ccip/concepts/message-lifecycle
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { fromViemClient } from "@chainlink/ccip-sdk/viem";
import { MessageStatus, networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import type { CCIPRequest } from "@chainlink/ccip-sdk";
import { getPublicClient } from "wagmi/actions";
import { NETWORKS, POLLING_CONFIG } from "@ccip-examples/shared-config";
import { toGenericPublicClient } from "@ccip-examples/shared-utils";
import { wagmiConfig, NETWORK_TO_CHAIN_ID } from "../config/wagmi.js";

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
 * Type for chain IDs configured in wagmi
 */
type ConfiguredChainId = (typeof wagmiConfig)["chains"][number]["id"];

/**
 * Hook for tracking CCIP message status
 *
 * @param sourceNetwork - Source network key (e.g., "ethereum-sepolia")
 * @param messageId - CCIP message ID to track (null to disable polling)
 * @returns Message status information and controls
 *
 * @example
 * ```tsx
 * const { status, description, isFinal } = useMessageStatus(
 *   "ethereum-sepolia",
 *   "0x1234..."
 * );
 *
 * if (isFinal) {
 *   console.log("Transfer complete:", status);
 * }
 * ```
 */
export function useMessageStatus(
  sourceNetwork: string | null,
  messageId: string | null
): MessageStatusResult {
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
   * Fetch message status from SDK
   */
  const fetchStatus = useCallback(async (): Promise<CCIPRequest | null> => {
    if (!sourceNetwork || !messageId) return null;

    const config = NETWORKS[sourceNetwork];
    if (!config || networkInfo(sourceNetwork).family !== ChainFamily.EVM) {
      throw new Error(`Invalid EVM network: ${sourceNetwork}`);
    }

    // Verify network is configured in wagmi before lookup
    if (!(sourceNetwork in NETWORK_TO_CHAIN_ID)) {
      throw new Error(`Network not configured in wagmi: ${sourceNetwork}`);
    }
    const chainId = NETWORK_TO_CHAIN_ID[sourceNetwork] as ConfiguredChainId;

    const client = getPublicClient(wagmiConfig, { chainId });
    const chain = await fromViemClient(toGenericPublicClient(client));

    return chain.getMessageById(messageId);
  }, [sourceNetwork, messageId]);

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

    // Schedule next poll with exponential backoff
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
    if (!messageId || !sourceNetwork) {
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
  }, [messageId, sourceNetwork, poll, stopPolling]);

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
