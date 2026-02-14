/**
 * CCIP SDK Example: Discover Supported Tokens
 *
 * This script demonstrates how to discover which tokens are supported
 * for transfer on a specific CCIP lane (source → destination).
 *
 * Works with all chain families through the unified Chain interface.
 * The SDK's getSupportedTokens() reads from on-chain registries
 * (TokenAdminRegistry contract on EVM, PDAs on Solana, etc.).
 *
 * Usage:
 *   pnpm tokens -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1
 *   pnpm tokens -s solana-devnet -d ethereum-testnet-sepolia
 */

import { Command } from "commander";
import { networkInfo, CCIPError, CCIPTokenPoolChainConfigNotFoundError } from "@chainlink/ccip-sdk";
import { NETWORKS, NETWORK_IDS, CHAIN_FAMILY_LABELS } from "@ccip-examples/shared-config";
import { formatAmount, createChain } from "@ccip-examples/shared-utils";

function validateChainKey(key: string): string {
  if (!NETWORK_IDS.includes(key)) {
    console.error(`Error: Unknown chain key "${key}"`);
    console.error(`Run "pnpm chains" to see supported chains.`);
    process.exit(1);
  }
  return key;
}

/**
 * Discover and display supported tokens for a specific lane.
 *
 * Uses the base {@link Chain} interface so this works with any
 * chain family the SDK supports.
 */
async function discoverSupportedTokens(sourceKey: string, destKey: string): Promise<void> {
  const sourceConfig = NETWORKS[sourceKey];
  const destConfig = NETWORKS[destKey];

  if (!sourceConfig || !destConfig) {
    console.error(`Invalid network: ${sourceKey} or ${destKey}`);
    return;
  }

  const sourceInfo = networkInfo(sourceKey);
  const destInfo = networkInfo(destKey);
  const familyLabel = CHAIN_FAMILY_LABELS[sourceInfo.family];

  console.log(`\nLane: ${sourceConfig.name} → ${destConfig.name} (${familyLabel})`);
  console.log("-".repeat(60));

  try {
    const sourceChain = await createChain(sourceKey, sourceConfig.rpcUrl);

    // getTokenAdminRegistryFor works for all chain families:
    // EVM resolves via OnRamp → TokenAdminRegistry, Solana returns the router itself.
    const registryAddress = await sourceChain.getTokenAdminRegistryFor(sourceConfig.routerAddress);
    console.log(`Token Admin Registry: ${registryAddress}`);

    // Get all supported tokens from the registry
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
        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);

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

          console.log(`  ${tokenInfo.symbol} (${tokenInfo.name ?? "N/A"})`);
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
  const program = new Command();

  program
    .name("tokens")
    .description("Discover supported tokens for a CCIP lane")
    .requiredOption("-s, --source <chain>", "Source chain key (run 'pnpm chains' to see options)")
    .requiredOption("-d, --dest <chain>", "Destination chain key")
    .action(async (opts: { source: string; dest: string }) => {
      const source = validateChainKey(opts.source);
      const dest = validateChainKey(opts.dest);

      console.log("=".repeat(60));
      console.log("CCIP SDK: Discover Supported Tokens");
      console.log("=".repeat(60));

      await discoverSupportedTokens(source, dest);

      console.log("=".repeat(60));
    });

  await program.parseAsync(process.argv);
}

main().catch(console.error);
