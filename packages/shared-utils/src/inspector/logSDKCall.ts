import { inspectorStore } from "./store.js";
import type { LogSDKCallOptions } from "./types.js";

/** Serialize values for display (bigint -> string, addresses -> truncated) */
export function serializeForDisplay(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" && value.startsWith("0x") && value.length > 12)
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  if (typeof value === "object" && value !== null) {
    // Check for explicit display name (e.g. Chain instances with minified class names)
    const displayName = (value as Record<string, unknown>).__displayName;
    if (typeof displayName === "string") return displayName;
    try {
      return JSON.stringify(
        value,
        (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
        2
      );
    } catch {
      // Circular references (e.g. Chain instances with WebSocket clients)
      const name = (value.constructor as { name?: string } | undefined)?.name ?? "Object";
      return `[${name}]`;
    }
  }
  if (value == null) return "undefined";
  // Remaining primitives (number, boolean, symbol) are safe to stringify
  return typeof value === "symbol" ? value.toString() : `${value as string | number | boolean}`;
}

/**
 * Wrap an async SDK call with inspector logging.
 * Zero overhead when inspector is disabled -- immediately calls fn().
 * NEVER swallows errors -- always re-throws.
 */
export async function logSDKCall<T>(options: LogSDKCallOptions, fn: () => Promise<T>): Promise<T> {
  if (!inspectorStore.getSnapshot().enabled) return fn();

  // Polling aggregation: update existing entry instead of creating new
  // Match on pollingId (or method) AND phase so tracking-phase polls don't clobber setup/transfer entries
  if (options.isPolling) {
    const matchKey = options.pollingId ?? options.method;
    const calls = inspectorStore.getSnapshot().calls;
    let existing: (typeof calls)[number] | undefined;
    for (let i = calls.length - 1; i >= 0; i--) {
      const entry = calls[i];
      const entryKey = entry?.pollingId ?? entry?.method;
      if (entryKey === matchKey && entry?.phase === options.phase) {
        existing = entry;
        break;
      }
    }
    if (existing) {
      inspectorStore.updatePollingCall(matchKey, { status: "pending" }, options.phase);
      const start = performance.now();
      try {
        const result = await fn();
        inspectorStore.updatePollingCall(
          matchKey,
          {
            status: "success",
            result: serializeForDisplay(result),
            durationMs: performance.now() - start,
          },
          options.phase
        );
        return result;
      } catch (err) {
        inspectorStore.updatePollingCall(
          matchKey,
          {
            status: "error",
            error: String(err),
            durationMs: performance.now() - start,
          },
          options.phase
        );
        throw err;
      }
    }
  }

  const id = crypto.randomUUID();
  const start = performance.now();

  inspectorStore.addCall({
    id,
    timestamp: Date.now(),
    phase: options.phase,
    method: options.method,
    pollingId: options.pollingId,
    displayArgs: options.displayArgs,
    codeSnippet: options.codeSnippet,
    annotation: options.annotation,
    status: "pending",
  });

  try {
    const result = await fn();
    inspectorStore.updateCall(id, {
      status: "success",
      result: serializeForDisplay(result),
      durationMs: performance.now() - start,
    });
    return result;
  } catch (err) {
    inspectorStore.updateCall(id, {
      status: "error",
      error: String(err),
      durationMs: performance.now() - start,
    });
    throw err;
  }
}

/** Synchronous variant for non-async calls like networkInfo() */
export function logSDKCallSync<T>(options: LogSDKCallOptions, fn: () => T): T {
  if (!inspectorStore.getSnapshot().enabled) return fn();

  const id = crypto.randomUUID();
  const start = performance.now();

  inspectorStore.addCall({
    id,
    timestamp: Date.now(),
    phase: options.phase,
    method: options.method,
    displayArgs: options.displayArgs,
    codeSnippet: options.codeSnippet,
    annotation: options.annotation,
    status: "pending",
  });

  try {
    const result = fn();
    inspectorStore.updateCall(id, {
      status: "success",
      result: serializeForDisplay(result),
      durationMs: performance.now() - start,
    });
    return result;
  } catch (err) {
    inspectorStore.updateCall(id, {
      status: "error",
      error: String(err),
      durationMs: performance.now() - start,
    });
    throw err;
  }
}
