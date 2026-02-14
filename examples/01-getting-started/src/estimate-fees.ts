/**
 * CCIP SDK Example: Estimate Transfer Fees (EVM + Solana)
 *
 * This script demonstrates how to estimate fees for cross-chain transfers
 * across both EVM and Solana networks. This is useful for:
 * - Displaying fee estimates to users before they confirm
 * - Comparing costs across different routes
 * - Pre-flight validation
 *
 * Usage:
 *   pnpm fees
 */

import { EVMChain, SolanaChain, networkInfo, ChainFamily, CCIPError } from "@chainlink/ccip-sdk";
import {
  NETWORKS,
  NETWORK_IDS,
  getTokenAddress,
  DUMMY_ADDRESSES,
  type NetworkConfig,
} from "@ccip-examples/shared-config";
import { formatAmount, parseAmount, buildTokenTransferMessage } from "@ccip-examples/shared-utils";

const TOKEN_SYMBOL = "CCIP-BnM";
const AMOUNT = "1.0";

/**
 * Estimate fee for any chain → any chain route
 *
 * Works with both EVM and Solana source chains since they share
 * the same getFee() interface.
 */
async function estimateFee(
  sourceChain: EVMChain | SolanaChain,
  sourceConfig: NetworkConfig,
  destNetworkId: string,
  tokenAddress: string,
  amount: bigint
): Promise<{ fee: bigint; feeFormatted: string } | null> {
  try {
    const destInfo = networkInfo(destNetworkId);

    // Use shared message builder for consistency
    const message = buildTokenTransferMessage({
      receiver: DUMMY_ADDRESSES.evm,
      tokenAddress,
      amount,
    });

    const fee = await sourceChain.getFee({
      router: sourceConfig.routerAddress,
      destChainSelector: destInfo.chainSelector,
      message,
    });

    return {
      fee,
      feeFormatted: formatAmount(fee, sourceConfig.nativeCurrency.decimals),
    };
  } catch (error) {
    // Log CCIP errors with recovery suggestions
    if (CCIPError.isCCIPError(error)) {
      console.error(`  Error: ${error.message}`);
      if (error.recovery) {
        console.error(`  Recovery: ${error.recovery}`);
      }
      if (error.isTransient) {
        console.error(`  Note: This error may be transient. Try again later.`);
      }
    } else {
      console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    return null;
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("CCIP SDK: Fee Estimation Across All Routes (EVM + Solana)");
  console.log("=".repeat(70));
  console.log();
  console.log(`Estimating fees for transferring ${AMOUNT} ${TOKEN_SYMBOL}`);
  console.log();

  console.log("Route".padEnd(45) + "Fee".padEnd(20) + "Status");
  console.log("-".repeat(75));

  // Iterate through all networks (EVM and Solana)
  for (const [sourceKey, sourceConfig] of Object.entries(NETWORKS)) {
    const tokenAddress = getTokenAddress(TOKEN_SYMBOL, sourceKey);
    if (!tokenAddress) continue;

    // Create chain instance based on family
    const sourceChain =
      networkInfo(sourceKey).family === ChainFamily.Solana
        ? await SolanaChain.fromUrl(sourceConfig.rpcUrl)
        : await EVMChain.fromUrl(sourceConfig.rpcUrl);

    // Get token decimals from SDK
    const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
    const amount = parseAmount(AMOUNT, tokenInfo.decimals);

    for (const destKey of NETWORK_IDS) {
      if (sourceKey === destKey) continue;

      const destConfig = NETWORKS[destKey];
      if (!destConfig) continue;

      const route = `${sourceConfig.name} → ${destConfig.name}`;
      process.stdout.write(route.padEnd(45));

      const result = await estimateFee(sourceChain, sourceConfig, destKey, tokenAddress, amount);

      if (result) {
        const feeStr = `${result.feeFormatted} ${sourceConfig.nativeCurrency.symbol}`;
        console.log(feeStr.padEnd(20) + "OK");
      } else {
        console.log("N/A".padEnd(20) + "Route not available");
      }
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Note: Fees are estimates and may vary based on network conditions.");
  console.log("=".repeat(70));
}

main().catch(console.error);
