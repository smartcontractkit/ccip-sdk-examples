/**
 * Error categorization for consistent UX across CCIP examples.
 * Builds on ccipErrors and errors; browser-safe.
 */

import { CCIPError } from "@chainlink/ccip-sdk";
import type { ChainFamily } from "@chainlink/ccip-sdk";
import { parseCCIPError } from "./ccipErrors.js";
import type { ParsedCCIPError } from "./ccipErrors.js";

export type ErrorCategory =
  | "WALLET_REJECTION"
  | "INSUFFICIENT_BALANCE"
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR"
  | "VALIDATION_ERROR"
  | "SDK_ERROR"
  | "UNKNOWN_ERROR";

export type ErrorSeverity = "warning" | "error";

export interface CategorizedError {
  category: ErrorCategory;
  message: string;
  details?: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  recovery?: string;
  originalError?: unknown;
  rawErrorData?: string;
}

const WALLET_REJECTION_PATTERNS = [
  "user rejected",
  "user denied",
  "user cancelled",
  "rejected by user",
  "rejected the request",
  "denied transaction",
  "transaction was rejected",
];

const INSUFFICIENT_PATTERNS = ["insufficient", "not enough", "exceeds balance", "balance too low"];

const NETWORK_PATTERNS = [
  "network",
  "fetch",
  "connection",
  "econnrefused",
  "econnreset",
  "timeout",
  "could not detect network",
];

const TIMEOUT_PATTERNS = ["timeout", "timed out", "deadline exceeded"];

const VALIDATION_PATTERNS = [
  "invalid",
  "validation",
  "required",
  "must be",
  "invalid address",
  "invalid receiver",
];

function lowerMessage(err: unknown): string {
  if (err === null || err === undefined) return "";
  if (typeof err === "string") return err.toLowerCase();
  if (err instanceof Error) return err.message.toLowerCase();
  // Plain objects: try .message for compatibility (null already returned above)
  const msg =
    typeof err === "object" && "message" in err ? (err as { message: unknown }).message : err;
  if (typeof msg === "string") return msg.toLowerCase();
  return safeStringify(err).toLowerCase();
}

function mapParsedToCategory(parsed: ParsedCCIPError): ErrorCategory {
  const name = parsed.errorName;
  if (
    name === "InsufficientFeeTokenAmount" ||
    name === "InvalidFeeToken" ||
    INSUFFICIENT_PATTERNS.some((p) => parsed.userMessage.toLowerCase().includes(p))
  ) {
    return "INSUFFICIENT_BALANCE";
  }
  if (
    name === "ChainNotAllowed" ||
    name === "UnsupportedDestinationChain" ||
    name === "UnsupportedToken" ||
    name === "TokenRemoteNotConfigured" ||
    name === "PoolDoesNotExist"
  ) {
    return "VALIDATION_ERROR";
  }
  if (
    name === "RateLimitReached" ||
    name === "TokenRateLimitReached" ||
    name === "AggregateValueRateLimitReached"
  ) {
    return "SDK_ERROR";
  }
  return "SDK_ERROR";
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function buildRawErrorData(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(`message: ${error.message}`);
    if (error.name) parts.push(`name: ${error.name}`);
    parts.push(`timestamp: ${new Date().toISOString()}`);
    if (typeof error.stack === "string") parts.push(`stack: ${error.stack}`);
  } else if (typeof error === "string") {
    parts.push(`message: ${error}`);
    parts.push(`timestamp: ${new Date().toISOString()}`);
  } else {
    parts.push(safeStringify(error));
    parts.push(`timestamp: ${new Date().toISOString()}`);
  }
  return parts.join("\n");
}

/**
 * Categorize an error for consistent display and recovery UX.
 */
export function categorizeError(
  error: unknown,
  options?: { chainFamily?: ChainFamily }
): CategorizedError {
  if (error === null || error === undefined) {
    return {
      category: "UNKNOWN_ERROR",
      message: "An unexpected error occurred",
      severity: "error",
      recoverable: false,
      rawErrorData: `timestamp: ${new Date().toISOString()}`,
    };
  }

  const family = options?.chainFamily;

  // 1. CCIPError from SDK (message, recovery, isTransient)
  if (CCIPError.isCCIPError(error)) {
    const message = error.message;
    const recovery = error.recovery ?? undefined;
    const isTransient = error.isTransient === true;
    return {
      category: isTransient ? "NETWORK_ERROR" : "SDK_ERROR",
      message,
      severity: "error",
      recoverable: isTransient,
      recovery: recovery ?? undefined,
      originalError: error,
      rawErrorData: buildRawErrorData(error),
    };
  }

  // 2. Parsed CCIP error (EVM/Solana contract or logs)
  const parsed = parseCCIPError(error, family);
  if (parsed) {
    const category = mapParsedToCategory(parsed);
    return {
      category,
      message: parsed.userMessage,
      severity: "error",
      recoverable: category === "NETWORK_ERROR",
      originalError: error,
      rawErrorData: buildRawErrorData(error),
    };
  }

  // 3. Pattern matching on message (generic Error or string)
  const msg = lowerMessage(error);
  const displayMessage =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : safeStringify(error);

  if (WALLET_REJECTION_PATTERNS.some((p) => msg.includes(p))) {
    return {
      category: "WALLET_REJECTION",
      message: "Transaction was rejected",
      severity: "warning",
      recoverable: true,
      originalError: error,
    };
  }

  if (INSUFFICIENT_PATTERNS.some((p) => msg.includes(p))) {
    return {
      category: "INSUFFICIENT_BALANCE",
      message: displayMessage,
      severity: "error",
      recoverable: false,
      recovery: "Add funds or reduce the amount.",
      originalError: error,
    };
  }

  if (TIMEOUT_PATTERNS.some((p) => msg.includes(p))) {
    return {
      category: "TIMEOUT_ERROR",
      message: displayMessage,
      severity: "error",
      recoverable: true,
      recovery: "Try again in a few moments.",
      originalError: error,
    };
  }

  if (NETWORK_PATTERNS.some((p) => msg.includes(p))) {
    return {
      category: "NETWORK_ERROR",
      message: displayMessage,
      severity: "error",
      recoverable: true,
      recovery: "Check your connection and try again.",
      originalError: error,
      rawErrorData: buildRawErrorData(error),
    };
  }

  if (VALIDATION_PATTERNS.some((p) => msg.includes(p))) {
    return {
      category: "VALIDATION_ERROR",
      message: displayMessage,
      severity: "error",
      recoverable: false,
      originalError: error,
    };
  }

  return {
    category: "UNKNOWN_ERROR",
    message: displayMessage || "An unexpected error occurred",
    severity: "error",
    recoverable: false,
    originalError: error,
    rawErrorData: buildRawErrorData(error),
  };
}

/**
 * True if the error is a user wallet rejection (e.g. "user rejected").
 */
export function isWalletRejection(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  const msg = lowerMessage(error);
  return WALLET_REJECTION_PATTERNS.some((p) => msg.includes(p));
}

/**
 * True if the error is recoverable (e.g. transient network, wallet rejection).
 */
export function isRecoverableError(error: unknown): boolean {
  const cat = categorizeError(error);
  return cat.recoverable;
}
