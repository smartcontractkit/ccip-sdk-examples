/**
 * CCIP SDK Example: Inspect Token Pool Configuration
 *
 * This script demonstrates how to inspect token pool configurations,
 * including rate limits and remote chain settings. This is useful for:
 * - Understanding transfer capacity on a lane
 * - Checking if a lane is rate-limited
 * - Viewing pool type and version
 *
 * Works with all supported chain families (EVM, Solana, etc.) through
 * the unified Chain interface.
 *
 * Usage:
 *   pnpm pools
 *   pnpm pools <network> <token_address>
 */

import type { Chain, RateLimiterState, TokenInfo } from "@chainlink/ccip-sdk";
import { networkInfo, CCIPError, CCIPTokenPoolChainConfigNotFoundError } from "@chainlink/ccip-sdk";
import { NETWORKS, NETWORK_IDS, getTokenAddress } from "@ccip-examples/shared-config";
import { formatAmount, createChain } from "@ccip-examples/shared-utils";

/**
 * Format a rate limiter state for display.
 *
 * @param label - Direction label (e.g. "Outbound", "Inbound")
 * @param state - Rate limiter state (null when rate limiting is disabled)
 * @param tokenInfo - Token metadata for formatting amounts
 */
function printRateLimiterState(label: string, state: RateLimiterState, tokenInfo: TokenInfo): void {
  if (!state) {
    console.log(`    ${label} Rate Limit: Disabled`);
    return;
  }

  const { tokens, capacity, rate } = state;
  const percentAvailable = capacity > 0n ? Number((tokens * 100n) / capacity) : 100;

  console.log(`    ${label} Rate Limit:`);
  console.log(
    `      Available: ${formatAmount(tokens, tokenInfo.decimals)} / ${formatAmount(capacity, tokenInfo.decimals)} (${percentAvailable}%)`
  );
  console.log(`      Refill:    ${formatAmount(rate, tokenInfo.decimals)} tokens/sec`);
}

/**
 * Inspect a token pool with full configuration.
 *
 * Uses the base {@link Chain} interface so this works with any
 * chain family that the SDK supports.
 */
async function inspectPool(chain: Chain, networkKey: string, tokenAddress: string): Promise<void> {
  const config = NETWORKS[networkKey];

  if (!config) {
    console.error(`Unknown network: ${networkKey}`);
    return;
  }

  const { family } = networkInfo(networkKey);
  console.log(`\nInspecting pool on ${config.name} (${family})`);
  console.log(`Token: ${tokenAddress}`);
  console.log("-".repeat(60));

  try {
    // Get token info from SDK
    const tokenInfo = await chain.getTokenInfo(tokenAddress);
    console.log(`Token Name:   ${tokenInfo.name ?? "N/A"}`);
    console.log(`Token Symbol: ${tokenInfo.symbol}`);
    console.log(`Decimals:     ${tokenInfo.decimals}`);

    // Get token admin registry
    const registryAddress = await chain.getTokenAdminRegistryFor(config.routerAddress);

    // Get token configuration
    const tokenConfig = await chain.getRegistryTokenConfig(registryAddress, tokenAddress);

    if (!tokenConfig.tokenPool) {
      console.log("No pool found for this token.");
      return;
    }

    console.log(`Pool Address: ${tokenConfig.tokenPool}`);

    // Get pool configuration
    const poolConfig = await chain.getTokenPoolConfig(tokenConfig.tokenPool);
    if (poolConfig.typeAndVersion) {
      console.log(`Pool Type:    ${poolConfig.typeAndVersion}`);
    }
    console.log(`Router:       ${poolConfig.router}`);

    // Some chain families expose extra fields (e.g. Solana's tokenPoolProgram)
    if ("tokenPoolProgram" in poolConfig && poolConfig.tokenPoolProgram) {
      console.log(`Pool Program: ${poolConfig.tokenPoolProgram as string}`);
    }

    // Get remote configurations for all destinations
    console.log(`\nRemote Chain Configurations:`);

    for (const destKey of NETWORK_IDS) {
      if (destKey === networkKey) continue;

      const destConfig = NETWORKS[destKey];
      if (!destConfig) continue;

      try {
        const destInfo = networkInfo(destKey);
        const remote = await chain.getTokenPoolRemote(
          tokenConfig.tokenPool,
          destInfo.chainSelector
        );

        console.log(`\n  → ${destConfig.name}`);
        console.log(`    Remote Token: ${remote.remoteToken}`);
        console.log(`    Remote Pools: ${remote.remotePools.join(", ")}`);

        printRateLimiterState("Outbound", remote.outboundRateLimiterState, tokenInfo);
        printRateLimiterState("Inbound", remote.inboundRateLimiterState, tokenInfo);
      } catch (error) {
        // Destination not configured for this pool — skip silently
        if (error instanceof CCIPTokenPoolChainConfigNotFoundError) continue;

        console.log(`\n  → ${destConfig.name}`);
        if (CCIPError.isCCIPError(error)) {
          console.log(`    Error: ${error.message}`);
          if (error.recovery) {
            console.log(`    Recovery: ${error.recovery}`);
          }
        } else {
          console.log(`    Error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  } catch (error) {
    if (CCIPError.isCCIPError(error)) {
      console.error(`Error inspecting pool: ${error.message}`);
      if (error.recovery) {
        console.error(`Recovery: ${error.recovery}`);
      }
    } else {
      console.error(
        `Error inspecting pool: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("CCIP SDK: Inspect Token Pool Configuration");
  console.log("=".repeat(60));

  const args = process.argv.slice(2);

  if (args.length === 2) {
    const network = args[0] ?? "";
    const token = args[1] ?? "";
    const config = NETWORKS[network];

    if (!config) {
      console.error(`Unknown network: ${network}`);
      process.exit(1);
    }

    const chain = await createChain(network, config.rpcUrl);
    await inspectPool(chain, network, token);
  } else if (args.length === 0) {
    // Show pools for CCIP-BnM on all networks
    console.log("\nInspecting CCIP-BnM across all networks:");

    for (const [networkKey, config] of Object.entries(NETWORKS)) {
      const tokenAddress = getTokenAddress("CCIP-BnM", networkKey);
      if (!tokenAddress) continue;

      const chain = await createChain(networkKey, config.rpcUrl);
      await inspectPool(chain, networkKey, tokenAddress);
    }
  } else {
    console.log("Usage:");
    console.log("  pnpm pools                           # Inspect all CCIP-BnM pools");
    console.log("  pnpm pools <network> <token_address> # Inspect specific pool");
    console.log();
    console.log("Examples:");
    console.log("  pnpm pools ethereum-testnet-sepolia 0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05");
    console.log("  pnpm pools solana-devnet 3PjyGzj1jGVgHSKS4VR1Hr1memm63PmN8L9rtPDKwzZ6");
    process.exit(1);
  }

  console.log();
  console.log("=".repeat(60));
}

main().catch(console.error);
