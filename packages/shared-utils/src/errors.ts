/**
 * Error handling utilities for CCIP SDK examples
 *
 * Note: For CCIP-specific error handling, use the SDK's CCIPError class directly.
 * The SDK provides all necessary error information:
 * - `error.message` - Human-readable message
 * - `error.recovery` - Recovery suggestion
 * - `error.isTransient` - Whether to retry
 * - `error.code` - Machine-readable code
 * - `error.context` - Structured context (IDs, addresses)
 *
 * For retry logic, use the SDK's shouldRetry() and getRetryDelay() functions.
 */

import { CCIPError } from "@chainlink/ccip-sdk";

/**
 * Extract error message from various error types
 *
 * For CCIPError, returns the formatted message with recovery info.
 * For other errors, returns the basic error message.
 *
 * @param error - Error to format
 * @returns Formatted error message
 */
export function getErrorMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  // CCIPError has all the information we need
  if (CCIPError.isCCIPError(error)) {
    let message = error.message;

    if (error.recovery) {
      message += `\n  Recovery: ${error.recovery}`;
    }

    if (error.isTransient) {
      message += `\n  Note: This error may be transient. Try again later.`;
    }

    return message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object") {
    return JSON.stringify(error);
  }

  // Primitives (number, boolean, bigint, symbol)
  return String(error as string | number | boolean | bigint | symbol);
}
