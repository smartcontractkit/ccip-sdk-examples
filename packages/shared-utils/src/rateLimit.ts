/**
 * Rate limit bucket formatting for CCIP pool display.
 * Chain-agnostic (EVM/Solana pool rate limit state).
 */

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

/**
 * Format a rate limit bucket for display (current/max, rate, percentage).
 */
export function formatRateLimitBucket(
  bucket: RateLimitBucket | null,
  decimals = 18
): FormatRateLimitBucketResult | null {
  if (!bucket?.isEnabled) return null;

  const divisor = BigInt(10 ** decimals);
  const current = Number(bucket.tokens / divisor);
  const max = Number(bucket.capacity / divisor);
  const rate = Number(bucket.rate / divisor);
  const percentage = max > 0 ? Math.round((current / max) * 100) : 0;

  return {
    current: current.toLocaleString(),
    max: max.toLocaleString(),
    rate: `${rate.toLocaleString()}/sec`,
    percentage,
  };
}
