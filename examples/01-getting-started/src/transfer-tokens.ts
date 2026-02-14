/**
 * CCIP SDK Example: Transfer Tokens Cross-Chain
 *
 * This script demonstrates how to transfer tokens between chains
 * using the CCIP SDK. Works with any supported chain family.
 *
 * Usage:
 *   pnpm transfer -s <source> -d <dest>                      # Required: source and dest
 *   pnpm transfer -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1
 *   pnpm transfer -s solana-devnet -d ethereum-testnet-sepolia
 *   pnpm transfer -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1 -a 0.5
 *   pnpm transfer -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1 -f link
 *   pnpm transfer -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1 -v
 *
 * Prerequisites:
 *   - Set EVM_PRIVATE_KEY and/or SVM_PRIVATE_KEY in .env (see .env.example)
 *   - Have testnet tokens (ETH/SOL for gas, CCIP-BnM for transfer)
 *
 * Run `pnpm chains` to see all supported chain keys.
 */

import { Command } from "commander";
import { type ChainFamily, networkInfo, getCCIPExplorerUrl, CCIPError } from "@chainlink/ccip-sdk";
import { config } from "dotenv";
import * as readline from "readline";
import {
  NETWORKS,
  NETWORK_IDS,
  CHAIN_FAMILY_LABELS,
  getTokenAddress,
  getExplorerTxUrl,
  getDummyReceiver,
  resolveFeeTokenAddress,
  type FeeTokenOption,
} from "@ccip-examples/shared-config";
import {
  formatAmount,
  parseAmount,
  buildTokenTransferMessage,
  createChain,
  createLogger,
  createWallet,
} from "@ccip-examples/shared-utils";

config();

const DEFAULT_TOKEN = "CCIP-BnM";
const DEFAULT_AMOUNT = "0.001";

/**
 * Prompt user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Validate chain key exists
 */
function validateChainKey(key: string): string {
  if (!NETWORK_IDS.includes(key)) {
    console.error(`Error: Unknown chain key "${key}"`);
    console.error(`Run "pnpm chains" to see supported chains.`);
    process.exit(1);
  }
  return key;
}

/**
 * Get default receiver address based on destination chain family.
 *
 * When the sender address is available and the destination is the
 * same chain family, we use it (self-transfer). Otherwise we fall
 * back to a format-valid dummy address for the destination family.
 */
function getDefaultReceiver(
  destKey: string,
  sourceFamily: ChainFamily,
  senderAddress?: string
): string {
  const destFamily = networkInfo(destKey).family;

  // Self-transfer when same family and sender address available
  if (senderAddress && destFamily === sourceFamily) {
    return senderAddress;
  }

  return getDummyReceiver(destFamily);
}

interface TransferOptions {
  source: string;
  dest: string;
  token: string;
  amount: string;
  receiver?: string;
  /** Fee token selection: "native" (default) or "link". */
  feeToken: FeeTokenOption;
  /** Optional keypair path/key that overrides the env var (useful for Solana). */
  keypair?: string;
  verbose: boolean;
  yes: boolean;
}

/**
 * Transfer tokens cross-chain
 */
async function transfer(options: TransferOptions): Promise<string> {
  const { source, dest, token, amount, receiver, feeToken, keypair, verbose, yes } = options;
  const logger = createLogger(verbose);

  const sourceConfig = NETWORKS[source];
  const destConfig = NETWORKS[dest];
  const destInfo = networkInfo(dest);
  const sourceFamily = networkInfo(source).family;

  if (!sourceConfig || !destConfig) {
    throw new Error("Invalid network configuration");
  }

  // Resolve fee token: "native" → undefined, "link" → LINK address
  const feeTokenAddress = resolveFeeTokenAddress(feeToken, source);

  console.log(`Source:      ${sourceConfig.name} (${source})`);
  console.log(`Destination: ${destConfig.name} (${dest})`);
  console.log(`Token:       ${token}`);
  console.log(`Amount:      ${amount}`);
  console.log(`Fee Token:   ${feeToken}${feeTokenAddress ? ` (${feeTokenAddress})` : ""}`);
  console.log();

  // Step 1: Initialize wallet
  // CLI --keypair overrides the env var (useful for Solana keypair files)
  console.log("Step 1: Initializing wallet...");
  const { wallet, address: walletAddress } = createWallet(
    sourceFamily,
    sourceConfig.rpcUrl,
    keypair
  );
  console.log(`Wallet address: ${walletAddress}`);

  // Determine receiver address with smart defaults
  const receiverAddress = receiver ?? getDefaultReceiver(dest, sourceFamily, walletAddress);
  if (receiver) {
    console.log(`Receiver:       ${receiverAddress}`);
  } else if (receiverAddress === walletAddress) {
    console.log(`Receiver:       ${receiverAddress} (self)`);
  } else {
    console.log(`Receiver:       ${receiverAddress} (default)`);
  }

  // Step 2: Initialize CCIP SDK (pass logger so -v controls SDK debug output too)
  console.log("\nStep 2: Initializing CCIP SDK...");
  const sourceChain = await createChain(source, sourceConfig.rpcUrl, logger);

  // Get token address
  const tokenAddress = getTokenAddress(token, source);
  if (!tokenAddress) {
    throw new Error(`Token ${token} not found on ${source}`);
  }

  // Get token info from SDK
  const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
  const parsedAmount = parseAmount(amount, tokenInfo.decimals);
  console.log(`Token address: ${tokenAddress}`);

  // Step 3: Build CCIP message
  console.log("\nStep 3: Building CCIP message...");
  const message = buildTokenTransferMessage({
    receiver: receiverAddress,
    tokenAddress,
    amount: parsedAmount,
    feeToken: feeTokenAddress,
  });

  // Resolve fee token metadata for display and balance checks.
  // When feeTokenAddress is undefined, fee is paid in native currency.
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

  // Step 4: Estimate fee
  console.log("\nStep 4: Estimating transfer fee...");
  const fee = await sourceChain.getFee({
    router: sourceConfig.routerAddress,
    destChainSelector: destInfo.chainSelector,
    message,
  });
  console.log(`Estimated fee: ${formatAmount(fee, feeDecimals)} ${feeSymbol}`);

  // Step 5: Check balances
  console.log("\nStep 5: Checking balances...");
  const nativeBalance = await sourceChain.getBalance({
    holder: walletAddress,
  });
  const tokenBalance = await sourceChain.getBalance({
    holder: walletAddress,
    token: tokenAddress,
  });

  console.log(
    `Native balance: ${formatAmount(nativeBalance, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol}`
  );
  console.log(
    `Token balance:  ${formatAmount(tokenBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`
  );

  // When paying in a non-native fee token, check that balance too
  if (feeTokenAddress) {
    const feeTokenBalance = await sourceChain.getBalance({
      holder: walletAddress,
      token: feeTokenAddress,
    });
    console.log(`Fee token balance: ${formatAmount(feeTokenBalance, feeDecimals)} ${feeSymbol}`);
    if (feeTokenBalance < fee) {
      throw new Error(`Insufficient ${feeSymbol} for fee`);
    }
  } else if (nativeBalance < fee) {
    throw new Error(`Insufficient ${sourceConfig.nativeCurrency.symbol} for fee`);
  }

  if (tokenBalance < parsedAmount) {
    throw new Error(`Insufficient ${token}`);
  }

  // Confirmation prompt
  if (!yes) {
    console.log();
    console.log("=".repeat(60));
    console.log("Transfer Summary:");
    console.log(`  Amount:      ${amount} ${tokenInfo.symbol}`);
    console.log(`  From:        ${sourceConfig.name}`);
    console.log(`  To:          ${destConfig.name}`);
    console.log(`  Receiver:    ${receiverAddress}`);
    console.log(`  Fee:         ${formatAmount(fee, feeDecimals)} ${feeSymbol}`);
    console.log("=".repeat(60));

    const confirmed = await confirm("Proceed with transfer?");
    if (!confirmed) {
      console.log("Transfer cancelled.");
      process.exit(0);
    }
  }

  // Step 6: Send transfer
  console.log("\nStep 6: Sending cross-chain transfer...");
  const request = await sourceChain.sendMessage({
    router: sourceConfig.routerAddress,
    destChainSelector: destInfo.chainSelector,
    message: { ...message, fee },
    wallet,
  });

  console.log(`\nTransaction sent!`);
  console.log(`TX Hash:    ${request.tx.hash}`);
  console.log(`Message ID: ${request.message.messageId}`);
  console.log(`Block Explorer: ${getExplorerTxUrl(source, request.tx.hash)}`);
  console.log(`CCIP Explorer:  ${getCCIPExplorerUrl("msg", request.message.messageId)}`);

  return request.message.messageId;
}

async function main() {
  const program = new Command();

  program
    .name("transfer")
    .description("Transfer tokens cross-chain using CCIP SDK")
    .requiredOption("-s, --source <chain>", "Source chain key (run 'pnpm chains' to see options)")
    .requiredOption("-d, --dest <chain>", "Destination chain key")
    .option("-t, --token <symbol>", "Token symbol to transfer", DEFAULT_TOKEN)
    .option("-a, --amount <amount>", "Amount to transfer", DEFAULT_AMOUNT)
    .option(
      "-r, --receiver <address>",
      "Receiver address (defaults to self for same-family, dummy otherwise)"
    )
    .option("-f, --fee-token <type>", 'Fee token: "native" (default) or "link"', "native")
    .option(
      "-k, --keypair <path>",
      "Keypair file path or secret key (overrides SVM_PRIVATE_KEY env var)"
    )
    .option("-v, --verbose", "Enable verbose logging", false)
    .option("-y, --yes", "Skip confirmation prompt", false)
    .action(
      async (opts: {
        source: string;
        dest: string;
        token: string;
        amount: string;
        receiver?: string;
        feeToken: string;
        keypair?: string;
        verbose: boolean;
        yes: boolean;
      }) => {
        const source = validateChainKey(opts.source);
        const dest = validateChainKey(opts.dest);
        const sourceFamily = networkInfo(source).family;

        // Validate fee token option
        const feeTokenValue = opts.feeToken.toLowerCase();
        if (feeTokenValue !== "native" && feeTokenValue !== "link") {
          console.error(`Invalid --fee-token value: "${opts.feeToken}". Use "native" or "link".`);
          process.exit(1);
        }

        const options: TransferOptions = {
          source,
          dest,
          token: opts.token,
          amount: opts.amount,
          receiver: opts.receiver,
          feeToken: feeTokenValue,
          keypair: opts.keypair,
          verbose: opts.verbose,
          yes: opts.yes,
        };

        const familyLabel = CHAIN_FAMILY_LABELS[sourceFamily];
        console.log("=".repeat(60));
        console.log(`CCIP SDK: Transfer Tokens Cross-Chain (${familyLabel})`);
        console.log("=".repeat(60));
        console.log();

        try {
          const messageId = await transfer(options);

          console.log("\n" + "=".repeat(60));
          console.log("Transfer initiated successfully!");
          console.log(`Message ID: ${messageId}`);
          console.log();
          console.log("Track status:");
          console.log(`  pnpm status ${messageId}`);
          console.log(`  ${getCCIPExplorerUrl("msg", messageId)}`);
          console.log("=".repeat(60));
        } catch (error) {
          console.error("\n" + "=".repeat(60));
          if (CCIPError.isCCIPError(error)) {
            console.error("Error:", error.message);
            console.error("Code:", error.code);
            if (error.recovery) {
              console.error("Recovery:", error.recovery);
            }
            if (error.isTransient) {
              console.error("Note: This error may be transient. Try again later.");
            }
          } else if (error instanceof Error) {
            console.error("Error:", error.message);
          } else {
            console.error("Error:", String(error));
          }
          if (options.verbose && error instanceof Error) {
            console.error("\nStack trace:", error.stack);
          }
          console.error("=".repeat(60));
          process.exit(1);
        }
      }
    );

  await program.parseAsync(process.argv);
}

main().catch(console.error);
