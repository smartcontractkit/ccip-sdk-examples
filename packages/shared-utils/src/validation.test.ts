import { ChainFamily } from "@chainlink/ccip-sdk";
import { describe, expect, it } from "vitest";

import {
  formatAmount,
  formatAmountFull,
  isAmountWithinBalance,
  isValidAddress,
  isValidAmount,
  isValidAptosAddress,
  isValidEVMAddress,
  isValidSolanaAddress,
  parseAmount,
  truncateAddress,
} from "./validation.js";

// Well-known public addresses.
const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOLANA = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const APTOS = "0x0000000000000000000000000000000000000000000000000000000000000100";

describe("address validation", () => {
  it("accepts a checksummed EVM address", () => {
    expect(isValidEVMAddress(EVM)).toBe(true);
  });

  it("accepts a lowercase EVM address", () => {
    expect(isValidEVMAddress(EVM.toLowerCase())).toBe(true);
  });

  it("rejects EVM addresses of the wrong length", () => {
    expect(isValidEVMAddress("0x1234")).toBe(false);
    expect(isValidEVMAddress(`${EVM}00`)).toBe(false);
  });

  it("rejects an empty string for every family", () => {
    expect(isValidEVMAddress("")).toBe(false);
    expect(isValidSolanaAddress("")).toBe(false);
    expect(isValidAptosAddress("")).toBe(false);
  });

  it("accepts a base58 Solana address and rejects an EVM one", () => {
    expect(isValidSolanaAddress(SOLANA)).toBe(true);
    expect(isValidSolanaAddress(EVM)).toBe(false);
  });

  it("accepts an Aptos address", () => {
    expect(isValidAptosAddress(APTOS)).toBe(true);
  });

  it("routes by chain family", () => {
    expect(isValidAddress(EVM, ChainFamily.EVM)).toBe(true);
    expect(isValidAddress(SOLANA, ChainFamily.Solana)).toBe(true);
    expect(isValidAddress(APTOS, ChainFamily.Aptos)).toBe(true);
    expect(isValidAddress(EVM, ChainFamily.Solana)).toBe(false);
  });

  it("returns false for families it does not handle", () => {
    // Sui, TON and Canton have no address check yet.
    expect(isValidAddress(EVM, ChainFamily.Sui)).toBe(false);
    expect(isValidAddress(EVM, ChainFamily.TON)).toBe(false);
    expect(isValidAddress(EVM, ChainFamily.Canton)).toBe(false);
    expect(isValidAddress(EVM, ChainFamily.Unknown)).toBe(false);
  });
});

describe("isValidAmount", () => {
  it("accepts positive decimal strings", () => {
    expect(isValidAmount("1")).toBe(true);
    expect(isValidAmount("0.001")).toBe(true);
    expect(isValidAmount("1000.5")).toBe(true);
  });

  it("rejects empty, zero and negative values", () => {
    expect(isValidAmount("")).toBe(false);
    expect(isValidAmount("   ")).toBe(false);
    expect(isValidAmount("0")).toBe(false);
    expect(isValidAmount("-1")).toBe(false);
  });

  it("rejects notation the transfer form cannot parse", () => {
    // parseFloat would accept these.
    expect(isValidAmount("1e5")).toBe(false);
    expect(isValidAmount("1,000")).toBe(false);
    expect(isValidAmount("abc")).toBe(false);
    expect(isValidAmount(".5")).toBe(false);
  });
});

describe("parseAmount and formatAmount", () => {
  it("round-trips an 18-decimal amount", () => {
    const raw = parseAmount("1.5", 18);
    expect(raw).toBe(1_500000000000000000n);
    expect(formatAmountFull(raw, 18)).toBe("1.5");
  });

  it("round-trips a 6-decimal amount", () => {
    const raw = parseAmount("10000.75", 6);
    expect(raw).toBe(10_000_750000n);
    expect(formatAmountFull(raw, 6)).toBe("10000.75");
  });

  it("adds thousand separators and truncates to four places by default", () => {
    expect(formatAmount(parseAmount("924014.8671234", 18), 18)).toBe("924,014.8671");
  });

  it("strips trailing zeros", () => {
    expect(formatAmount(parseAmount("1.5000", 18), 18)).toBe("1.5");
    expect(formatAmount(parseAmount("2.0", 18), 18)).toBe("2");
  });

  it("formats zero", () => {
    expect(formatAmount(0n, 18)).toBe("0");
  });

  it("keeps full precision in formatAmountFull, unlike formatAmount", () => {
    const raw = parseAmount("0.123456789", 18);
    expect(formatAmount(raw, 18)).toBe("0.1234");
    expect(formatAmountFull(raw, 18)).toBe("0.123456789");
  });

  it("shows a dust balance as 0 at display precision", () => {
    // The Max button uses formatAmountFull so dust is not dropped.
    expect(formatAmount(1n, 18)).toBe("0");
    expect(formatAmountFull(1n, 18)).toBe("0.000000000000000001");
  });
});

describe("isAmountWithinBalance", () => {
  const balance = parseAmount("10", 18);

  it("accepts an amount below the balance", () => {
    expect(isAmountWithinBalance("9.999", balance, 18)).toBe(true);
  });

  it("accepts an amount exactly equal to the balance", () => {
    expect(isAmountWithinBalance("10", balance, 18)).toBe(true);
  });

  it("rejects an amount above the balance", () => {
    expect(isAmountWithinBalance("10.000000000000000001", balance, 18)).toBe(false);
  });

  it("rejects an invalid amount without consulting the balance", () => {
    expect(isAmountWithinBalance("-1", balance, 18)).toBe(false);
    expect(isAmountWithinBalance("", balance, 18)).toBe(false);
  });

  it("compares in the token's own decimals", () => {
    // 10 USDC at 6 decimals.
    const usdc = parseAmount("10", 6);
    expect(isAmountWithinBalance("10", usdc, 6)).toBe(true);
    expect(isAmountWithinBalance("11", usdc, 6)).toBe(false);
  });
});

describe("truncateAddress", () => {
  it("shortens a full EVM address", () => {
    expect(truncateAddress(EVM)).toBe("0xd8dA6B...A96045");
  });

  it("leaves a string shorter than the cut length untouched", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
  });

  it("honours a custom character count", () => {
    expect(truncateAddress(EVM, 4)).toBe("0xd8dA...6045");
  });
});
