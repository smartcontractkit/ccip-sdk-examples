/**
 * Error handling utilities for CCIP SDK examples
 *
 * Note: For CCIP-specific error handling, use the SDK's CCIPError class directly.
 * It provides `code`, `recovery`, and `isTransient` properties.
 *
 * For retry logic, use the SDK's withRetry() and shouldRetry() functions.
 */

/**
 * Extract error message from various error types
 *
 * Useful for displaying errors in UI when you need a simple string message.
 */
export function getErrorMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object") {
    // Handle ethers.js errors
    const anyError = error as Record<string, unknown>;

    if (typeof anyError.reason === "string") {
      return anyError.reason;
    }

    if (typeof anyError.message === "string") {
      return anyError.message;
    }

    if (typeof anyError.shortMessage === "string") {
      return anyError.shortMessage;
    }

    // Handle nested errors
    if (anyError.error && typeof anyError.error === "object") {
      return getErrorMessage(anyError.error);
    }
  }

  return "Unknown error";
}
