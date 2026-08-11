import { describe, expect, it } from "vitest";

import { formatExecutionError, summarizeErrorMessage } from "./errorCategorization.js";

describe("summarizeErrorMessage", () => {
  it("returns a short message unchanged", () => {
    expect(summarizeErrorMessage("Insufficient balance")).toBe("Insufficient balance");
  });

  it("prefers the labelled line over a calldata dump", () => {
    const viemStyle = [
      "The contract function reverted.",
      "0x" + "ab".repeat(200),
      "Details: execution reverted: ERC20: transfer amount exceeds balance",
      "Version: viem@2.45.3",
    ].join("\n");
    expect(summarizeErrorMessage(viemStyle)).toBe(
      "execution reverted: ERC20: transfer amount exceeds balance"
    );
  });

  it("strips the Reason label too", () => {
    expect(summarizeErrorMessage("Reason: rate limit reached")).toBe("rate limit reached");
  });

  it("skips a leading hex blob when nothing is labelled", () => {
    const raw = ["0x" + "cd".repeat(100), "execution reverted"].join("\n");
    expect(summarizeErrorMessage(raw)).toBe("execution reverted");
  });

  it("truncates a blob embedded in an otherwise useful sentence", () => {
    const raw = `call to 0x${"ef".repeat(60)} failed`;
    const out = summarizeErrorMessage(raw);
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(60);
    expect(out.startsWith("call to 0xefefefef")).toBe(true);
  });

  it("falls back to the raw text when every line is hex", () => {
    const raw = "0x" + "11".repeat(80);
    expect(summarizeErrorMessage(raw)).toContain("…");
  });
});

describe("formatExecutionError", () => {
  it("renders a nested revert as a chain with its parameters", () => {
    // The shape the SDK returned for a real failed message on Base Sepolia.
    expect(
      formatExecutionError({
        error: "ReceiverError(bytes err)",
        "err.error": "InvalidRouter(address router)",
        "err.router": "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93",
      })
    ).toBe("ReceiverError → InvalidRouter (router: 0xD3b06cEb…e88a93)");
  });

  it("renders a flat revert with no parameters", () => {
    expect(formatExecutionError({ error: "RateLimitReached()" })).toBe("RateLimitReached");
  });

  it("keeps short values unshortened", () => {
    expect(formatExecutionError({ error: "Bad(uint256 n)", n: "42" })).toBe("Bad (n: 42)");
  });

  it("falls back when no error name is present", () => {
    expect(formatExecutionError({ someField: "x" })).toBe("Reverted (someField: x)");
  });
});
