/**
 * CCIP SDK Example: Inspect Token Pool Configuration (EVM + Solana)
 *
 * This script demonstrates how to inspect token pool configurations,
 * including rate limits and remote chain settings. This is useful for:
 * - Understanding transfer capacity on a lane
 * - Checking if a lane is rate-limited
 * - Viewing pool type and version
 *
 * Both EVM and Solana chains support full pool inspection with rate limits.
 *
 * Usage:
 *   pnpm pools
 *   pnpm pools <network> <token_address>
 */

import {
  EVMChain,
  SolanaChain,
  networkInfo,
  ChainFamily,
  CCIPError,
  CCIPTokenPoolChainConfigNotFoundError,
} from "@chainlink/ccip-sdk";
import { NETWORKS, NETWORK_IDS, getTokenAddress } from "@ccip-examples/shared-config";
import { formatAmount } from "@ccip-examples/shared-utils";

/**
 * Inspect token pool with full configuration
 *
 * Works with both EVM and Solana chains since they share
 * the same pool inspection interface.
 */
async function inspectPool(
  chain: EVMChain | SolanaChain,
  networkKey: string,
  tokenAddress: string
) {
  const config = NETWORKS[networkKey];

  if (!config) {
    console.error(`Unknown network: ${networkKey}`);
    return;
  }

  const chainFamily = networkInfo(networkKey).family === ChainFamily.Solana ? "Solana" : "EVM";
  console.log(`\nInspecting pool on ${config.name} (${chainFamily})`);
  console.log(`Token: ${tokenAddress}`);
  console.log("-".repeat(60));

  try {
    // Get token info from SDK
    const tokenInfo = await chain.getTokenInfo(tokenAddress);
    console.log(`Token Name:   ${tokenInfo.name}`);
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
    // Solana has additional tokenPoolProgram field
    if ("tokenPoolProgram" in poolConfig && poolConfig.tokenPoolProgram) {
      console.log(`Pool Program: ${poolConfig.tokenPoolProgram}`);
    }

    // Get remote configurations for all destinations
    console.log(`\nRemote Chain Configurations:`);

    for (const destKey of NETWORK_IDS) {
      if (destKey === networkKey) continue;

      const destConfig = NETWORKS[destKey];
      if (!destConfig) continue;

      try {
        const destInfo = networkInfo(destKey);
        // Use getTokenPoolRemote (singular) for single destination lookup
        const remote = await chain.getTokenPoolRemote(
          tokenConfig.tokenPool,
          destInfo.chainSelector
        );

        console.log(`\n  → ${destConfig.name}`);
        console.log(`    Remote Token: ${remote.remoteToken}`);
        console.log(`    Remote Pools: ${remote.remotePools.join(", ")}`);

        // Outbound rate limit (source → destination)
        if (remote.outboundRateLimiterState) {
          const { tokens, capacity, rate } = remote.outboundRateLimiterState;
          const percentAvailable = capacity > 0n ? Number((tokens * 100n) / capacity) : 100;
          console.log(`    Outbound Rate Limit:`);
          console.log(
            `      Available: ${formatAmount(tokens, tokenInfo.decimals)} / ${formatAmount(capacity, tokenInfo.decimals)} (${percentAvailable}%)`
          );
          console.log(`      Refill:    ${formatAmount(rate, tokenInfo.decimals)} tokens/sec`);
        } else {
          console.log(`    Outbound Rate Limit: Disabled`);
        }

        // Inbound rate limit (destination → source)
        if (remote.inboundRateLimiterState) {
          const { tokens, capacity, rate } = remote.inboundRateLimiterState;
          const percentAvailable = capacity > 0n ? Number((tokens * 100n) / capacity) : 100;
          console.log(`    Inbound Rate Limit:`);
          console.log(
            `      Available: ${formatAmount(tokens, tokenInfo.decimals)} / ${formatAmount(capacity, tokenInfo.decimals)} (${percentAvailable}%)`
          );
          console.log(`      Refill:    ${formatAmount(rate, tokenInfo.decimals)} tokens/sec`);
        } else {
          console.log(`    Inbound Rate Limit: Disabled`);
        }
      } catch (error) {
        // Use SDK error types - CCIPTokenPoolChainConfigNotFoundError means destination not configured
        if (error instanceof CCIPTokenPoolChainConfigNotFoundError) {
          // Expected: destination not configured for this pool - skip silently
        } else if (CCIPError.isCCIPError(error)) {
          console.log(`\n  → ${destConfig.name}`);
          console.log(`    Error: ${error.message}`);
          if (error.recovery) {
            console.log(`    Recovery: ${error.recovery}`);
          }
        } else {
          console.log(`\n  → ${destConfig.name}`);
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
  console.log("CCIP SDK: Inspect Token Pool Configuration (EVM + Solana)");
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

    const chain =
      networkInfo(network).family === ChainFamily.Solana
        ? await SolanaChain.fromUrl(config.rpcUrl)
        : await EVMChain.fromUrl(config.rpcUrl);

    await inspectPool(chain, network, token);
  } else if (args.length === 0) {
    // Show pools for CCIP-BnM on all networks
    console.log("\nInspecting CCIP-BnM across all networks:");

    for (const [networkKey, config] of Object.entries(NETWORKS)) {
      const tokenAddress = getTokenAddress("CCIP-BnM", networkKey);
      if (tokenAddress) {
        const chain =
          networkInfo(networkKey).family === ChainFamily.Solana
            ? await SolanaChain.fromUrl(config.rpcUrl)
            : await EVMChain.fromUrl(config.rpcUrl);
        await inspectPool(chain, networkKey, tokenAddress);
      }
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
