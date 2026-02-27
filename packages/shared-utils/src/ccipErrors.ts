/**
 * @ccip-examples/shared-utils — CCIP error parsing
 *
 * Parses CCIP-specific errors using @chainlink/ccip-sdk chain parse methods.
 * - EVMChain.parse(error) — decodes hex error selectors via CCIP contract ABIs
 * - SolanaChain.parse(logs) — parses Solana transaction logs
 */

import { EVMChain, SolanaChain, AptosChain, ChainFamily } from "@chainlink/ccip-sdk";

/**
 * Parsed CCIP error with user-friendly message
 */
export interface ParsedCCIPError {
  /** Original error name from the contract (e.g. 'ChainNotAllowed') */
  errorName: string;
  /** User-friendly error message */
  userMessage: string;
  /** Raw parsed data from the SDK */
  rawParsed: Record<string, unknown>;
  /** Chain family where error originated (SDK type) */
  chainFamily: ChainFamily;
}

/**
 * Map of known CCIP error names to user-friendly messages.
 * When adding support for new CCIP versions, add new error mappings here.
 * To find error selectors: cast sig "ErrorName(paramTypes)"
 */
export const CCIP_ERROR_MESSAGES: Record<string, string> = {
  // Router errors
  ChainNotAllowed:
    "This route is not supported. The destination chain is not enabled for this token.",
  UnsupportedDestinationChain: "The destination chain is not supported by CCIP.",
  InvalidMsgValue: "Invalid message value. The fee amount may be incorrect.",

  // Token pool errors
  RateLimitReached:
    "Rate limit reached. Please try a smaller amount or wait for the bucket to refill.",
  TokenRateLimitReached: "Token rate limit reached. Please try a smaller amount.",
  AggregateValueRateLimitReached: "Aggregate value rate limit reached.",
  UnsupportedToken: "This token is not supported on the selected route.",
  TokenRemoteNotConfigured: "This token is not configured for the destination chain.",
  PoolDoesNotExist: "Token pool does not exist for this token.",
  CallerIsNotARampOnRouter: "Invalid caller - not authorized.",

  // OnRamp errors
  InvalidExtraArgsTag: "Invalid extra arguments format.",
  MessageGasLimitTooHigh: "Message gas limit exceeds maximum allowed.",
  InvalidAddress: "Invalid address format.",
  InvalidReceiver: "Invalid receiver address for the destination chain.",

  // Fee errors
  InsufficientFeeTokenAmount:
    "Insufficient fee. Please ensure you have enough native tokens for the fee.",
  InvalidFeeToken: "Invalid fee token specified.",

  // General errors
  ZeroAddressNotAllowed: "Zero address is not allowed.",
  MustBeProposedOwner: "Caller must be the proposed owner.",
  OnlyCallableByOwner: "Only callable by the contract owner.",
};

/**
 * Extract revert data from viem's nested error structure.
 * viem wraps errors in a cause chain; revert data (hex) may be at any level.
 */
function extractViemRevertData(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const err = error as Record<string, unknown>;

  if ("data" in err && typeof err.data === "string" && err.data.startsWith("0x")) {
    return err.data;
  }

  if ("revert" in err && err.revert && typeof err.revert === "object") {
    const revert = err.revert as Record<string, unknown>;
    if ("data" in revert && typeof revert.data === "string" && revert.data.startsWith("0x")) {
      return revert.data;
    }
  }

  if ("cause" in err && err.cause) {
    return extractViemRevertData(err.cause);
  }

  const hexRegex = /\b(0x[0-9a-fA-F]{8,})\b/;
  if ("message" in err && typeof err.message === "string") {
    const hexMatch = hexRegex.exec(err.message);
    if (hexMatch) return hexMatch[1];
  }

  if ("details" in err && typeof err.details === "string") {
    const hexMatch = hexRegex.exec(err.details);
    if (hexMatch) return hexMatch[1];
  }

  return undefined;
}

/**
 * Extract error name and message from SDK parsed result
 */
function extractParsedError(parsed: Record<string, unknown>): ParsedCCIPError {
  let errorName = "Unknown";
  let errorInfo = "";

  const errorNameRegex = /^(\w+)\(/;
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      const match = errorNameRegex.exec(value);
      const name = match?.[1];
      if (name && /^[A-Z]/.test(name)) {
        errorName = name;
        errorInfo = value;
        break;
      }
    }
    if ((key.startsWith("revert.") || key.startsWith("error.")) && key.includes(".")) {
      const lastPart = key.split(".").pop();
      if (lastPart && /^[A-Z]/.test(lastPart)) {
        errorName = lastPart;
        errorInfo = typeof value === "string" ? value : String(value);
      }
    }
  }

  const userMessage =
    CCIP_ERROR_MESSAGES[errorName] ??
    (errorInfo ? `Transaction failed: ${errorInfo}` : `Transaction failed: ${errorName}`);

  return {
    errorName,
    userMessage,
    rawParsed: parsed,
    chainFamily: ChainFamily.EVM,
  };
}

/**
 * Parse an EVM error using the CCIP SDK.
 * EVMChain.parse() uses CCIP contract ABIs to decode error selectors.
 */
export function parseEVMError(error: unknown): ParsedCCIPError | undefined {
  try {
    const revertData = extractViemRevertData(error);
    const parsed = EVMChain.parse(revertData ?? error);
    if (!parsed) {
      if (revertData && revertData !== error) {
        const hexParsed = EVMChain.parse(revertData);
        if (hexParsed) return extractParsedError(hexParsed);
      }
      return undefined;
    }
    return extractParsedError(parsed);
  } catch {
    return undefined;
  }
}

/**
 * Parse a Solana error using the CCIP SDK.
 * SolanaChain.parse() extracts error info from transaction logs.
 */
export function parseSolanaError(errorOrLogs: unknown): ParsedCCIPError | undefined {
  try {
    let dataToParse: unknown = errorOrLogs;
    if (errorOrLogs && typeof errorOrLogs === "object") {
      const err = errorOrLogs as Record<string, unknown>;
      if ("logs" in err && Array.isArray(err.logs)) {
        dataToParse = err.logs;
      } else if ("transactionLogs" in err) {
        dataToParse = err;
      }
    }

    const parsed = SolanaChain.parse(dataToParse);
    if (!parsed) return undefined;

    const parsedRecord = parsed as Record<string, unknown>;
    const errorName: string =
      parsedRecord.program != null
        ? typeof parsedRecord.program === "string"
          ? parsedRecord.program
          : JSON.stringify(parsedRecord.program)
        : "SolanaProgram";
    const errorMessage: string =
      parsedRecord.error != null
        ? typeof parsedRecord.error === "string"
          ? parsedRecord.error
          : JSON.stringify(parsedRecord.error)
        : JSON.stringify(parsed);

    let userMessage = `Solana transaction failed: ${errorMessage}`;
    for (const [pattern, message] of Object.entries(CCIP_ERROR_MESSAGES)) {
      if (
        typeof pattern === "string" &&
        typeof message === "string" &&
        errorMessage.toLowerCase().includes(pattern.toLowerCase())
      ) {
        userMessage = message;
        break;
      }
    }

    return {
      errorName,
      userMessage,
      rawParsed: parsedRecord,
      chainFamily: ChainFamily.Solana,
    };
  } catch {
    return undefined;
  }
}

/**
 * Parse an Aptos error using the CCIP SDK.
 * AptosChain.parse() decodes Aptos-specific data (extra args, messages).
 * Move contract errors use abort codes — the SDK surfaces them as structured data.
 */
export function parseAptosError(error: unknown): ParsedCCIPError | undefined {
  try {
    const parsed = AptosChain.parse(error);
    if (!parsed) return undefined;

    // AptosChain.parse returns extra-args structures with a _tag field
    const tag = "_tag" in parsed ? String(parsed._tag) : "Unknown";
    const userMessage = CCIP_ERROR_MESSAGES[tag] ?? `Aptos transaction failed: ${tag}`;

    return {
      errorName: tag,
      userMessage,
      rawParsed: parsed as unknown as Record<string, unknown>,
      chainFamily: ChainFamily.Aptos,
    };
  } catch {
    return undefined;
  }
}

/**
 * Parse any CCIP error; optionally pass chain family hint.
 */
export function parseCCIPError(
  error: unknown,
  chainFamily?: ChainFamily
): ParsedCCIPError | undefined {
  if (chainFamily === ChainFamily.EVM) return parseEVMError(error);
  if (chainFamily === ChainFamily.Solana) return parseSolanaError(error);
  if (chainFamily === ChainFamily.Aptos) return parseAptosError(error);
  return parseEVMError(error) ?? parseSolanaError(error) ?? parseAptosError(error);
}

/**
 * Get user-friendly message for a CCIP error.
 */
export function getCCIPErrorMessage(error: unknown, chainFamily?: ChainFamily): string {
  const parsed = parseCCIPError(error, chainFamily);
  if (parsed) return parsed.userMessage;
  if (error instanceof Error) return error.message;
  return "An unknown error occurred";
}
