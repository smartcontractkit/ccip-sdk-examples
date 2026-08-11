/**
 * Rate limit bucket formatting for CCIP pool display.
 * Chain-agnostic (EVM/Solana pool rate limit state).
 */

import { formatUnits } from "viem";

export interface RateLimitBucket {
  tokens: bigint;
  capacity: bigint;
  rate: bigint;
  isEnabled: boolean;
}

export interface FormatRateLimitBucketResult {
  current: string;
  max: string;
  rate: string;
  percentage: number;
}

/** Keeps large buckets readable while still showing sub-unit refill rates. */
const MAX_FRACTION_DIGITS = 4;

/**
 * Raw pool units to a grouped decimal string, computed on the bigint so no precision is
 * lost before display. Integer division would floor a 0.5/sec refill to 0, and a Number
 * conversion would render a nearly-full bucket as full.
 */
function toTokenUnits(raw: bigint, decimals: number): string {
  const [whole = "0", fraction = ""] = formatUnits(raw, decimals).split(".");
  const grouped = BigInt(whole).toLocaleString();
  const trimmed = fraction.slice(0, MAX_FRACTION_DIGITS).replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

/**
 * Format a rate limit bucket for display (current/max, rate, percentage).
 * `decimals` must match the bucket's token; source and destination tokens can differ.
 */
export function formatRateLimitBucket(
  bucket: RateLimitBucket | null,
  decimals = 18
): FormatRateLimitBucketResult | null {
  if (!bucket?.isEnabled) return null;

  // Computed on the raw bigints and floored, so 99.5% does not report as 100%.
  const percentage = bucket.capacity > 0n ? Number((bucket.tokens * 100n) / bucket.capacity) : 0;

  return {
    current: toTokenUnits(bucket.tokens, decimals),
    max: toTokenUnits(bucket.capacity, decimals),
    rate: `${toTokenUnits(bucket.rate, decimals)}/sec`,
    percentage,
  };
}

/**
 * The bucket after `elapsedMs` of refill, capped at capacity.
 *
 * Mirrors RateLimiter._calculateRefill on chain, so a caller can advance a
 * polled bucket locally between reads without guessing.
 */
export function refilledBucket(bucket: RateLimitBucket, elapsedMs: number): RateLimitBucket {
  if (bucket.rate <= 0n || bucket.tokens >= bucket.capacity) return bucket;
  const gained = (bucket.rate * BigInt(Math.max(0, Math.floor(elapsedMs)))) / 1000n;
  const tokens = bucket.tokens + gained;
  return { ...bucket, tokens: tokens > bucket.capacity ? bucket.capacity : tokens };
}
