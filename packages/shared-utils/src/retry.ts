/**
 * Retry utilities for handling transient errors
 *
 * Leverages the SDK's built-in retry logic:
 * - CCIPError.isTransient - Tells us if error is retryable
 * - getRetryDelay() - Gets appropriate delay from error
 * - shouldRetry() - Fallback for non-CCIP errors
 */

import { shouldRetry, getRetryDelay, CCIPError, formatErrorForLogging } from "@chainlink/ccip-sdk";

export interface RetryConfig {
  /** Initial delay in ms before first retry (fallback if SDK doesn't specify) */
  initialDelay: number;
  /** Maximum delay in ms between retries */
  maxDelay: number;
  /** Delay increment per attempt in ms */
  delayIncrement: number;
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Optional callback for logging retry attempts */
  onRetry?: (attempt: number, delay: number, error: unknown) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelay: 2000, // 2 seconds
  maxDelay: 30000, // 30 seconds
  delayIncrement: 3000, // Increase by 3s
  maxAttempts: 10,
};

/**
 * Execute a function with retry logic
 *
 * Retry strategy:
 * - Retry decision: Use SDK's shouldRetry() (checks CCIPError.isTransient)
 * - Retry delay:
 *   - If SDK provides delay via getRetryDelay(): Use it on every attempt
 *   - Otherwise: Use exponential backoff (initialDelay → maxDelay)
 * - Timeout: Stops after maxAttempts reached
 *
 * @param fn - Async function to execute with retry
 * @param config - Retry configuration (merged with defaults)
 * @returns Result of the function if successful
 * @throws Last error if maxAttempts exhausted or error is not retryable
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => apiClient.getMessageById(messageId),
 *   { maxAttempts: 10 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let currentDelay = cfg.initialDelay;
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Use SDK's shouldRetry() - checks CCIPError.isTransient and network errors
      if (!shouldRetry(error)) {
        // Non-retryable error - log if CCIPError and throw
        if (CCIPError.isCCIPError(error)) {
          console.error("Non-retryable CCIP error:", formatErrorForLogging(error));
        }
        throw error;
      }

      // Timeout: reached max attempts
      if (attempt === cfg.maxAttempts) {
        throw error;
      }

      // Determine retry delay
      let delay: number;

      if (CCIPError.isCCIPError(error)) {
        // SDK provides error-specific delay - use it every time
        // (e.g., MESSAGE_ID_NOT_FOUND always needs 30s for indexing)
        const sdkDelay = getRetryDelay(error);
        if (sdkDelay !== null) {
          delay = Math.min(sdkDelay, cfg.maxDelay);
        } else {
          // SDK doesn't provide delay - use exponential backoff
          delay = currentDelay;
          currentDelay = Math.min(currentDelay + cfg.delayIncrement, cfg.maxDelay);
        }
      } else {
        // Non-CCIP error (network, etc.) - use exponential backoff
        delay = currentDelay;
        currentDelay = Math.min(currentDelay + cfg.delayIncrement, cfg.maxDelay);
      }

      // Notify about retry
      if (cfg.onRetry) {
        cfg.onRetry(attempt, delay, error);
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Timeout: should never reach here, but TypeScript needs it
  throw lastError;
}
