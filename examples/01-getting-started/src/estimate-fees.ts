/**
 * CCIP SDK Example: Estimate Token Transfer Fees
 *
 * This script demonstrates how to estimate fees for cross-chain token
 * transfers across all supported chain families. This is useful for:
 * - Displaying fee estimates to users before they confirm
 * - Comparing native vs. LINK fee token costs
 * - Pre-flight validation
 *
 * Usage:
 *   pnpm fees -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1
 *   pnpm fees -s solana-devnet -d ethereum-testnet-sepolia
 *   pnpm fees -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1 --fee-token link
 *   pnpm fees -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1 -t CCIP-BnM -a 5.0
 */

import { Command } from "commander";
import type { Chain } from "@chainlink/ccip-sdk";
import { networkInfo, CCIPError } from "@chainlink/ccip-sdk";
import {
  NETWORKS,
  NETWORK_IDS,
  getTokenAddress,
  getDummyReceiver,
  resolveFeeTokenAddress,
  type FeeTokenOption,
  type NetworkConfig,
} from "@ccip-examples/shared-config";
import {
  formatAmount,
  parseAmount,
  buildTokenTransferMessage,
  createChain,
} from "@ccip-examples/shared-utils";

const DEFAULT_TOKEN = "CCIP-BnM";
const DEFAULT_AMOUNT = "1.0";

/**
 * Estimate the fee for a token transfer on any supported route.
 *
 * Works with any source chain family since they all share the same
 * {@link Chain.getFee} interface.
 */
async function estimateTokenTransferFee(
  sourceChain: Chain,
  sourceConfig: NetworkConfig,
  destNetworkId: string,
  tokenAddress: string,
  amount: bigint,
  feeTokenAddress?: string
): Promise<{
  fee: bigint;
  feeFormatted: string;
  feeSymbol: string;
} | null> {
  try {
    const destInfo = networkInfo(destNetworkId);

    // Select a valid receiver format for the destination chain family
    const receiver = getDummyReceiver(destInfo.family);

    const message = buildTokenTransferMessage({
      receiver,
      tokenAddress,
      amount,
      feeToken: feeTokenAddress,
    });

    const fee = await sourceChain.getFee({
      router: sourceConfig.routerAddress,
      destChainSelector: destInfo.chainSelector,
      message,
    });

    // When paying in a non-native fee token we need its decimals and symbol
    let feeDecimals: number;
    let feeSymbol: string;

    if (feeTokenAddress) {
      const feeTokenInfo = await sourceChain.getTokenInfo(feeTokenAddress);
      feeDecimals = feeTokenInfo.decimals;
      feeSymbol = feeTokenInfo.symbol;
    } else {
      feeDecimals = sourceConfig.nativeCurrency.decimals;
      feeSymbol = sourceConfig.nativeCurrency.symbol;
    }

    return {
      fee,
      feeFormatted: formatAmount(fee, feeDecimals),
      feeSymbol,
    };
  } catch (error) {
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

function validateChainKey(key: string): string {
  if (!NETWORK_IDS.includes(key)) {
    console.error(`Error: Unknown chain key "${key}"`);
    console.error(`Run "pnpm chains" to see supported chains.`);
    process.exit(1);
  }
  return key;
}

async function main() {
  const program = new Command();

  program
    .name("fees")
    .description("Estimate CCIP token transfer fees")
    .requiredOption("-s, --source <chain>", "Source chain key (run 'pnpm chains' to see options)")
    .requiredOption("-d, --dest <chain>", "Destination chain key")
    .option("-t, --token <symbol>", "Token symbol to estimate for", DEFAULT_TOKEN)
    .option("-a, --amount <amount>", "Amount to estimate for", DEFAULT_AMOUNT)
    .option("-f, --fee-token <type>", 'Fee token: "native" (default) or "link"', "native")
    .action(
      async (opts: {
        source: string;
        dest: string;
        token: string;
        amount: string;
        feeToken: string;
      }) => {
        const source = validateChainKey(opts.source);
        const dest = validateChainKey(opts.dest);

        const sourceConfig = NETWORKS[source];
        const destConfig = NETWORKS[dest];
        if (!sourceConfig || !destConfig) {
          console.error("Invalid network configuration");
          process.exit(1);
        }

        // Validate fee token option
        const feeTokenValue = opts.feeToken.toLowerCase();
        if (feeTokenValue !== "native" && feeTokenValue !== "link") {
          console.error(`Invalid --fee-token value: "${opts.feeToken}". Use "native" or "link".`);
          process.exit(1);
        }
        const feeTokenOption: FeeTokenOption = feeTokenValue;
        const feeTokenAddress = resolveFeeTokenAddress(feeTokenOption, source);

        console.log("=".repeat(60));
        console.log("CCIP SDK: Token Transfer Fee Estimation");
        console.log("=".repeat(60));
        console.log();
        console.log(`Source:    ${sourceConfig.name}`);
        console.log(`Dest:      ${destConfig.name}`);
        console.log(`Token:     ${opts.token}`);
        console.log(`Amount:    ${opts.amount}`);
        console.log(`Fee token: ${feeTokenOption}`);
        console.log();

        const tokenAddress = getTokenAddress(opts.token, source);
        if (!tokenAddress) {
          console.error(
            `Token "${opts.token}" not found on ${source}. Check shared-config/tokens.ts.`
          );
          process.exit(1);
        }

        const sourceChain = await createChain(source, sourceConfig.rpcUrl);

        const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
        const amount = parseAmount(opts.amount, tokenInfo.decimals);

        console.log(`Token address: ${tokenAddress}`);
        console.log(`Token decimals: ${tokenInfo.decimals}`);
        console.log();

        const result = await estimateTokenTransferFee(
          sourceChain,
          sourceConfig,
          dest,
          tokenAddress,
          amount,
          feeTokenAddress
        );

        if (result) {
          console.log(`Estimated fee: ${result.feeFormatted} ${result.feeSymbol}`);
        } else {
          console.log("Could not estimate fee for this route.");
        }

        console.log();
        console.log("=".repeat(60));
        console.log("Note: Fees are estimates and may vary based on network conditions.");
        console.log("=".repeat(60));
      }
    );

  await program.parseAsync(process.argv);
}

main().catch(console.error);
