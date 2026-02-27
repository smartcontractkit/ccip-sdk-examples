/**
 * Hook for tracking CCIP message status.
 *
 * Polls the CCIP API via CCIPAPIClient. Uses POLLING_CONFIG from shared-config.
 * No chain instance needed — API is chain-agnostic.
 *
 * @see https://docs.chain.link/ccip/concepts/message-lifecycle
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageStatus, CCIPAPIClient } from "@chainlink/ccip-sdk";
import {
  POLLING_CONFIG,
  getStatusDescription as getSharedStatusDescription,
} from "@ccip-examples/shared-config";
import { formatElapsedTime } from "../formatting.js";

export interface MessageStatusResult {
  status: MessageStatus | null;
  description: string;
  isFinal: boolean;
  isSuccess: boolean;
  isFailed: boolean;
  isTimedOut: boolean;
  isPolling: boolean;
  destTxHash: string | null;
  elapsedTime: string;
  error: string | null;
  stopPolling: () => void;
}

function getStatusDescription(status: MessageStatus | null): string {
  if (!status) return "Fetching status...";
  const key = String(status).toUpperCase();
  const desc = getSharedStatusDescription(key);
  return desc !== "Status unknown or message not found" ? desc : "Unknown status";
}

function isFinalStatus(status: MessageStatus | null): boolean {
  return status === MessageStatus.Success || status === MessageStatus.Failed;
}

/**
 * Track CCIP message status by message ID.
 *
 * @param messageId - CCIP message ID to track (null to disable polling)
 */
export function useMessageStatus(messageId: string | null): MessageStatusResult {
  const [status, setStatus] = useState<MessageStatus | null>(null);
  const [destTxHash, setDestTxHash] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDelayRef = useRef<number>(POLLING_CONFIG.initialDelay);
  const shouldStopRef = useRef(false);
  const apiClientRef = useRef<CCIPAPIClient | null>(null);

  const stopPolling = useCallback(() => {
    shouldStopRef.current = true;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const fetchStatus = useCallback(
    async (
      signal?: AbortSignal
    ): Promise<Awaited<ReturnType<CCIPAPIClient["getMessageById"]>> | null> => {
      if (!messageId) return null;
      apiClientRef.current ??= new CCIPAPIClient();
      const result = await apiClientRef.current.getMessageById(messageId);
      if (signal?.aborted) return null;
      return result;
    },
    [messageId]
  );

  const poll = useCallback(
    async (signal?: AbortSignal) => {
      if (shouldStopRef.current) return;

      try {
        const request = await fetchStatus(signal);
        if (signal?.aborted || !request?.metadata) return;

        const newStatus = request.metadata.status;
        setStatus(newStatus);
        if (request.metadata.receiptTransactionHash) {
          setDestTxHash(request.metadata.receiptTransactionHash);
        }
        if (isFinalStatus(newStatus)) {
          stopPolling();
          return;
        }
      } catch (err: unknown) {
        console.warn("Status poll error:", err);
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref can change during async
      if (!shouldStopRef.current) {
        currentDelayRef.current = Math.min(
          currentDelayRef.current + POLLING_CONFIG.delayIncrement,
          POLLING_CONFIG.maxDelay
        );
        pollTimeoutRef.current = setTimeout(() => void poll(signal), currentDelayRef.current);
      }
    },
    [fetchStatus, stopPolling]
  );

  useEffect(() => {
    if (!messageId) {
      setStatus(null);
      setDestTxHash(null);
      setIsPolling(false);
      setIsTimedOut(false);
      setError(null);
      setStartTime(null);
      setElapsedMs(0);
      return;
    }

    const controller = new AbortController();
    const signal = controller.signal;
    shouldStopRef.current = false;
    currentDelayRef.current = POLLING_CONFIG.initialDelay;
    setStatus(null);
    setDestTxHash(null);
    setError(null);
    setIsTimedOut(false);
    setIsPolling(true);
    setStartTime(Date.now());
    void poll(signal);
    return () => {
      controller.abort();
      stopPolling();
    };
  }, [messageId, poll, stopPolling]);

  useEffect(() => {
    if (!isPolling || !startTime) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setElapsedMs(elapsed);
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
