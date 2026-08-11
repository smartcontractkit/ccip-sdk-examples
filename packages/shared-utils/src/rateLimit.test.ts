import { describe, expect, it } from "vitest";

import { formatRateLimitBucket, refilledBucket, type RateLimitBucket } from "./rateLimit.js";

const bucket = (tokens: bigint, capacity: bigint, rate: bigint): RateLimitBucket => ({
  tokens,
  capacity,
  rate,
  isEnabled: true,
});

/** Raw pool values for a lane carrying an 18-decimal token. */
const FULL_18 = bucket(
  100_000_000000000000000000n,
  100_000_000000000000000000n,
  167_000000000000000000n
);

describe("formatRateLimitBucket", () => {
  it("returns null for a bucket that is not enabled", () => {
    expect(
      formatRateLimitBucket({ tokens: 0n, capacity: 0n, rate: 0n, isEnabled: false })
    ).toBeNull();
  });

  it("returns null for a missing bucket", () => {
    expect(formatRateLimitBucket(null)).toBeNull();
  });

  it("formats an 18-decimal bucket with thousands separators", () => {
    expect(formatRateLimitBucket(FULL_18, 18)).toEqual({
      current: "100,000",
      max: "100,000",
      rate: "167/sec",
      percentage: 100,
    });
  });

  it("renders a sub-unit refill rate as 0.5/sec", () => {
    // Integer division would render this as "0/sec", reading as no rate limit.
    const result = formatRateLimitBucket(
      bucket(10_000000000000000000n, 10_000000000000000000n, 500000000000000000n),
      18
    );
    expect(result?.rate).toBe("0.5/sec");
  });

  it("does not report a bucket one wei short of capacity as full", () => {
    // A number conversion would round this to exactly 100,000 at 100%.
    const result = formatRateLimitBucket(
      bucket(99_999_999999999999999999n, 100_000_000000000000000000n, 167_000000000000000000n),
      18
    );
    expect(result?.current).toBe("99,999.9999");
    expect(result?.percentage).toBe(99);
  });

  it("uses the decimals argument instead of the 18-decimal default", () => {
    // 10,000.75 tokens at 6 decimals, refilling 1.5 per second.
    expect(formatRateLimitBucket(bucket(10_000_750000n, 10_000_750000n, 1_500000n), 6)).toEqual({
      current: "10,000.75",
      max: "10,000.75",
      rate: "1.5/sec",
      percentage: 100,
    });
  });

  it("uses 18 decimals by default, which understates a 6-decimal bucket", () => {
    // The 18-decimal default yields zeros rather than an error.
    const result = formatRateLimitBucket(bucket(10_000_750000n, 10_000_750000n, 1_500000n));
    expect(result).toEqual({ current: "0", max: "0", rate: "0/sec", percentage: 100 });
  });

  it("floors the percentage rather than rounding it up", () => {
    const result = formatRateLimitBucket(
      bucket(99_500_000000000000000000n, 100_000_000000000000000000n, 167_000000000000000000n),
      18
    );
    expect(result?.percentage).toBe(99);
  });

  it("reports an empty bucket as zero, not as disabled", () => {
    const result = formatRateLimitBucket(
      bucket(0n, 100_000_000000000000000000n, 167_000000000000000000n),
      18
    );
    expect(result?.current).toBe("0");
    expect(result?.percentage).toBe(0);
  });

  it("treats a zero-capacity bucket as zero percent instead of dividing by zero", () => {
    const result = formatRateLimitBucket(bucket(0n, 0n, 0n), 18);
    expect(result?.percentage).toBe(0);
  });

  it("truncates trailing fraction digits beyond four", () => {
    // 1.23456789 tokens.
    const result = formatRateLimitBucket(
      bucket(1_234567890000000000n, 10_000000000000000000n, 1n),
      18
    );
    expect(result?.current).toBe("1.2345");
  });

  it("keeps thousands separators for a trillion-token capacity", () => {
    const result = formatRateLimitBucket(
      bucket(
        1_000_000_000_000_000000000000000000n,
        1_000_000_000_000_000000000000000000n,
        1_000000000000000000n
      ),
      18
    );
    expect(result?.max).toBe("1,000,000,000,000");
    expect(result?.rate).toBe("1/sec");
  });
});

describe("refilledBucket", () => {
  const b = (tokens: bigint, capacity: bigint, rate: bigint) => ({
    tokens,
    capacity,
    rate,
    isEnabled: true,
  });

  it("adds rate multiplied by elapsed seconds", () => {
    expect(refilledBucket(b(0n, 1000n, 10n), 3000).tokens).toBe(30n);
  });

  it("never exceeds capacity", () => {
    expect(refilledBucket(b(90n, 100n, 10n), 60_000).tokens).toBe(100n);
  });

  it("leaves a full bucket alone", () => {
    const full = b(100n, 100n, 10n);
    expect(refilledBucket(full, 10_000)).toBe(full);
  });

  it("leaves a zero-rate bucket alone", () => {
    const stuck = b(5n, 100n, 0n);
    expect(refilledBucket(stuck, 10_000)).toBe(stuck);
  });

  it("ignores a negative elapsed time from a clock adjustment", () => {
    expect(refilledBucket(b(50n, 100n, 10n), -5000).tokens).toBe(50n);
  });

  it("truncates sub-second refill like the contract's integer division", () => {
    expect(refilledBucket(b(0n, 1000n, 3n), 500).tokens).toBe(1n);
  });
});
