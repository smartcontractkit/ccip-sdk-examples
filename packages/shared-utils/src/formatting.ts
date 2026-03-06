/**
 * Shared formatting utilities for CCIP examples.
 */

/**
 * Format milliseconds as a human-friendly latency estimate (e.g. "~2 min", "~<1 min").
 */
export function formatLatency(totalMs: number): string {
  const minutes = Math.round(totalMs / 60_000);
  if (minutes < 1) return "~<1 min";
  return `~${minutes} min`;
}

/**
 * Format elapsed milliseconds as "Xm Ys" or "Xs".
 */
export function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${seconds}s`;
}

/**
 * Format a timestamp as relative time (e.g. "5m ago", "2h ago", "just now").
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

/**
 * Obfuscate an RPC URL so API keys in .env are never displayed.
 * Keeps protocol + hostname, replaces the rest with `***`.
 *
 * @example obfuscateRpcUrl("https://sepolia.infura.io/v3/abc123") => "https://sepolia.infura.io/***"
 */
export function obfuscateRpcUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/***`;
  } catch {
    return "***";
  }
}
