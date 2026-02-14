/**
 * CCIP SDK Example: Discover Supported Tokens (EVM + Solana)
 *
 * This script demonstrates how to discover which tokens are supported
 * for transfer on a specific CCIP lane (source → destination).
 *
 * Both EVM and Solana use the SDK's getSupportedTokens() method,
 * which reads from on-chain registries (contract for EVM, PDAs for Solana).
 *
 * Usage:
 *   pnpm tokens
 *   pnpm tokens <source_network> <dest_network>
 *   pnpm tokens ethereum-testnet-sepolia ethereum-testnet-sepolia-base-1
 */

import {
  EVMChain,
  SolanaChain,
  networkInfo,
  ChainFamily,
  CCIPError,
  CCIPTokenPoolChainConfigNotFoundError,
} from "@chainlink/ccip-sdk";
import { NETWORKS } from "@ccip-examples/shared-config";
import { formatAmount } from "@ccip-examples/shared-utils";

/**
 * Get supported tokens for any lane (EVM or Solana)
 *
 * Uses the SDK's unified getSupportedTokens() method which works
 * for both EVM (via TokenAdminRegistry contract) and Solana (via PDAs).
 */
async function getSupportedTokens(sourceKey: string, destKey: string) {
  const sourceConfig = NETWORKS[sourceKey];
  const destConfig = NETWORKS[destKey];

  if (!sourceConfig || !destConfig) {
    console.error(`Invalid network: ${sourceKey} or ${destKey}`);
    return;
  }

  const sourceInfo = networkInfo(sourceKey);
  const destInfo = networkInfo(destKey);
  const chainFamily = sourceInfo.family === ChainFamily.Solana ? "Solana" : "EVM";

  console.log(`\nLane: ${sourceConfig.name} → ${destConfig.name} (${chainFamily})`);
  console.log("-".repeat(50));

  try {
    // Create chain instance based on family
    const sourceChain =
      sourceInfo.family === ChainFamily.Solana
        ? await SolanaChain.fromUrl(sourceConfig.rpcUrl)
        : await EVMChain.fromUrl(sourceConfig.rpcUrl);

    // Get token registry address (EVM needs registry lookup, Solana uses router directly)
    let registryAddress: string;
    if (sourceInfo.family === ChainFamily.Solana) {
      // Solana: getSupportedTokens takes router directly
      registryAddress = sourceConfig.routerAddress;
    } else {
      // EVM: Get TokenAdminRegistry from router
      registryAddress = await sourceChain.getTokenAdminRegistryFor(sourceConfig.routerAddress);
      console.log(`Token Admin Registry: ${registryAddress}`);
    }

    // Get all supported tokens from the registry/router
    const tokens = await sourceChain.getSupportedTokens(registryAddress);

    if (tokens.length === 0) {
      console.log("No tokens found in registry.");
      return;
    }

    console.log(`\nFound ${tokens.length} registered token(s):`);
    console.log();

    // Check each token for destination support
    for (const tokenAddress of tokens) {
      try {
        // Get token info from SDK
        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);

        // Get token pool configuration
        const tokenConfig = await sourceChain.getRegistryTokenConfig(registryAddress, tokenAddress);

        if (!tokenConfig.tokenPool) {
          console.log(`  ${tokenInfo.symbol}: No pool configured`);
          console.log();
          continue;
        }

        // Check if pool supports the destination chain
        try {
          const remoteConfig = await sourceChain.getTokenPoolRemote(
            tokenConfig.tokenPool,
            destInfo.chainSelector
          );

          console.log(`  ${tokenInfo.symbol} (${tokenInfo.name})`);
          console.log(`    Address:   ${tokenAddress}`);
          console.log(`    Decimals:  ${tokenInfo.decimals}`);
          console.log(`    Pool:      ${tokenConfig.tokenPool}`);
          console.log(`    Supported: Yes`);
          console.log(`    Remote:    ${remoteConfig.remoteToken}`);

          // Show rate limits if available
          if (remoteConfig.outboundRateLimiterState) {
            const { tokens: available, capacity, rate } = remoteConfig.outboundRateLimiterState;
            const percentAvailable = capacity > 0n ? Number((available * 100n) / capacity) : 100;
            console.log(
              `    Rate Limit: ${formatAmount(available, tokenInfo.decimals)} / ${formatAmount(capacity, tokenInfo.decimals)} (${percentAvailable}%) - ${formatAmount(rate, tokenInfo.decimals)}/sec refill`
            );
          }
          console.log();
        } catch (error) {
          // Handle destination not configured
          if (error instanceof CCIPTokenPoolChainConfigNotFoundError) {
            console.log(`  ${tokenInfo.symbol}: Not configured for ${destConfig.name}`);
          } else if (CCIPError.isCCIPError(error)) {
            console.log(`  ${tokenInfo.symbol}: ${error.message}`);
            if (error.recovery) {
              console.log(`    Recovery: ${error.recovery}`);
            }
          } else {
            console.log(
              `  ${tokenInfo.symbol}: Error - ${error instanceof Error ? error.message : String(error)}`
            );
          }
          console.log();
        }
      } catch (error) {
        // Handle token info errors
        if (CCIPError.isCCIPError(error)) {
          console.log(`  Token ${tokenAddress}: ${error.message}`);
        } else {
          console.log(
            `  Token ${tokenAddress}: ${error instanceof Error ? error.message : "Unable to fetch info"}`
          );
        }
        console.log();
      }
    }
  } catch (error) {
    if (CCIPError.isCCIPError(error)) {
      console.error(`Error fetching supported tokens: ${error.message}`);
      if (error.recovery) {
        console.error(`Recovery: ${error.recovery}`);
      }
    } else {
      console.error(
        `Error fetching supported tokens: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("CCIP SDK: Discover Supported Tokens (EVM + Solana)");
  console.log("=".repeat(60));

  const args = process.argv.slice(2);

  if (args.length === 2) {
    // Specific lane requested
    const sourceKey = args[0] ?? "";
    const destKey = args[1] ?? "";
    const sourceConfig = NETWORKS[sourceKey];

    if (!sourceConfig) {
      console.error(`Unknown network: ${sourceKey}`);
      process.exit(1);
    }

    await getSupportedTokens(sourceKey, destKey);
  } else if (args.length === 0) {
    // Show all available networks
    console.log("\nAvailable networks:");
    for (const [key, config] of Object.entries(NETWORKS)) {
      const family = networkInfo(key).family === ChainFamily.Solana ? "Solana" : "EVM";
      console.log(`  ${key}: ${config.name} (${family})`);
    }

    console.log("\nUsage:");
    console.log("  pnpm tokens <source> <destination>");
    console.log("\nExamples:");
    console.log("  pnpm tokens ethereum-testnet-sepolia ethereum-testnet-sepolia-base-1");
    console.log("  pnpm tokens solana-devnet ethereum-testnet-sepolia");

    // Show one example
    console.log("\nExample output for ethereum-testnet-sepolia → ethereum-testnet-sepolia-base-1:");
    await getSupportedTokens("ethereum-testnet-sepolia", "ethereum-testnet-sepolia-base-1");
  } else {
    console.log("Usage: pnpm tokens <source_network> <dest_network>");
    console.log("Example: pnpm tokens ethereum-testnet-sepolia ethereum-testnet-sepolia-base-1");
    process.exit(1);
  }

  console.log("=".repeat(60));
}

main().catch(console.error);
