/**
 * CCIP SDK Example: Transfer Tokens Cross-Chain (EVM + Solana)
 *
 * This script demonstrates how to transfer tokens between chains
 * using the CCIP SDK. Supports both EVM and Solana as source chains.
 *
 * Usage:
 *   pnpm transfer                                    # Interactive with defaults
 *   pnpm transfer --source sepolia --dest base      # Custom source/dest
 *   pnpm transfer --amount 0.01 --receiver 0x...    # Custom amount and receiver
 *   pnpm transfer -v                                 # Verbose mode
 *
 * Prerequisites:
 *   - Set PRIVATE_KEY in .env file (EVM hex key or Solana base58 key)
 *   - Have testnet tokens (ETH/SOL for gas, CCIP-BnM for transfer)
 *
 * Run `pnpm chains` to see all supported chain keys.
 */

import { Command } from "commander";
import { ethers } from "ethers";
import {
  EVMChain,
  SolanaChain,
  networkInfo,
  ChainFamily,
  getCCIPExplorerUrl,
  CCIPError,
} from "@chainlink/ccip-sdk";
import { Keypair } from "@solana/web3.js";
import { Wallet as AnchorWallet } from "@coral-xyz/anchor";
import { config } from "dotenv";
import bs58 from "bs58";
import * as readline from "readline";
import {
  NETWORKS,
  NETWORK_IDS,
  getTokenAddress,
  getExplorerTxUrl,
  DUMMY_ADDRESSES,
} from "@ccip-examples/shared-config";
import { formatAmount, parseAmount, buildTokenTransferMessage } from "@ccip-examples/shared-utils";

config();

// Default configuration
const DEFAULT_SOURCE_EVM = "ethereum-testnet-sepolia";
const DEFAULT_DEST_EVM = "ethereum-testnet-sepolia-base-1";
const DEFAULT_SOURCE_SOLANA = "solana-devnet";
const DEFAULT_DEST_SOLANA = "ethereum-testnet-sepolia";
const DEFAULT_TOKEN = "CCIP-BnM";
const DEFAULT_AMOUNT = "0.001";

// Logger interface for SDK
interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

function createLogger(verbose: boolean): Logger {
  return {
    debug: verbose ? console.debug.bind(console) : () => {},
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
}

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
 * Get default receiver address based on destination chain family
 * - EVM destination: Use sender's EVM address or dummy EVM address
 * - Solana destination: Use dummy Solana address
 */
function getDefaultReceiver(destKey: string, senderAddress?: string): string {
  const destFamily = networkInfo(destKey).family;

  if (destFamily === ChainFamily.Solana) {
    // Solana destination: use dummy Solana address
    return DUMMY_ADDRESSES.solana;
  } else {
    // EVM destination: prefer sender address if available, otherwise dummy
    return senderAddress ?? DUMMY_ADDRESSES.evm;
  }
}

interface TransferOptions {
  source: string;
  dest: string;
  token: string;
  amount: string;
  receiver?: string;
  verbose: boolean;
  yes: boolean;
}

/**
 * Wallet abstraction for unified transfer logic
 */
type WalletInfo =
  | {
      address: string;
      signTransaction: (tx: ethers.TransactionLike) => Promise<string>;
    }
  | AnchorWallet;

/**
 * Initialize wallet based on chain family
 */
function initializeWallet(
  sourceKey: string,
  privateKey: string
): { wallet: WalletInfo; address: string; isSolana: boolean } {
  const sourceInfo = networkInfo(sourceKey);
  const sourceConfig = NETWORKS[sourceKey];

  if (!sourceConfig) {
    throw new Error(`Invalid network: ${sourceKey}`);
  }

  if (sourceInfo.family === ChainFamily.Solana) {
    // Solana wallet
    try {
      const secretKey = bs58.decode(privateKey);
      const wallet = new AnchorWallet(Keypair.fromSecretKey(secretKey));
      return {
        wallet,
        address: wallet.publicKey.toBase58(),
        isSolana: true,
      };
    } catch {
      throw new Error("Invalid Solana private key. Expected base58 encoded secret key.");
    }
  } else {
    // EVM wallet
    const provider = new ethers.JsonRpcProvider(sourceConfig.rpcUrl);
    const ethersWallet = new ethers.Wallet(privateKey, provider);
    return {
      wallet: {
        address: ethersWallet.address,
        signTransaction: async (tx: ethers.TransactionLike) => ethersWallet.signTransaction(tx),
      },
      address: ethersWallet.address,
      isSolana: false,
    };
  }
}

/**
 * Transfer tokens cross-chain (unified for EVM and Solana)
 */
async function transfer(options: TransferOptions, privateKey: string): Promise<string> {
  const { source, dest, token, amount, receiver, verbose, yes } = options;
  const logger = createLogger(verbose);

  const sourceConfig = NETWORKS[source];
  const destConfig = NETWORKS[dest];
  const sourceInfo = networkInfo(source);
  const destInfo = networkInfo(dest);

  if (!sourceConfig || !destConfig) {
    throw new Error("Invalid network configuration");
  }

  const isSolana = sourceInfo.family === ChainFamily.Solana;

  console.log(`Source:      ${sourceConfig.name} (${source})`);
  console.log(`Destination: ${destConfig.name} (${dest})`);
  console.log(`Token:       ${token}`);
  console.log(`Amount:      ${amount}`);
  console.log();

  // Step 1: Initialize wallet
  console.log("Step 1: Initializing wallet...");
  const { wallet, address: walletAddress } = initializeWallet(source, privateKey);
  console.log(`Wallet address: ${walletAddress}`);

  // Determine receiver address with smart defaults
  const receiverAddress =
    receiver ?? getDefaultReceiver(dest, isSolana ? undefined : walletAddress);
  if (receiver) {
    console.log(`Receiver:       ${receiverAddress}`);
  } else if (receiverAddress === walletAddress) {
    console.log(`Receiver:       ${receiverAddress} (self)`);
  } else {
    console.log(`Receiver:       ${receiverAddress} (default)`);
  }

  // Step 2: Initialize CCIP SDK
  console.log("\nStep 2: Initializing CCIP SDK...");
  const sourceChain = isSolana
    ? await SolanaChain.fromUrl(sourceConfig.rpcUrl)
    : await EVMChain.fromUrl(sourceConfig.rpcUrl);
  logger.debug("SDK initialized", { chainSelector: destInfo.chainSelector });

  // Get token address
  const tokenAddress = getTokenAddress(token, source);
  if (!tokenAddress) {
    throw new Error(`Token ${token} not found on ${source}`);
  }

  // Get token info from SDK
  const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
  const parsedAmount = parseAmount(amount, tokenInfo.decimals);
  console.log(`Token address: ${tokenAddress}`);
  logger.debug("Token info", tokenInfo);

  // Step 3: Build CCIP message
  console.log("\nStep 3: Building CCIP message...");
  const message = buildTokenTransferMessage({
    receiver: receiverAddress,
    tokenAddress,
    amount: parsedAmount,
  });
  logger.debug("Message", message);

  // Step 4: Estimate fee
  console.log("\nStep 4: Estimating transfer fee...");
  const fee = await sourceChain.getFee({
    router: sourceConfig.routerAddress,
    destChainSelector: destInfo.chainSelector,
    message,
  });
  console.log(
    `Estimated fee: ${formatAmount(fee, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol}`
  );

  // Step 5: Check balances
  console.log("\nStep 5: Checking balances...");
  const nativeBalance = await sourceChain.getBalance({ holder: walletAddress });
  const tokenBalance = await sourceChain.getBalance({ holder: walletAddress, token: tokenAddress });

  console.log(
    `Native balance: ${formatAmount(nativeBalance, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol}`
  );
  console.log(
    `Token balance:  ${formatAmount(tokenBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`
  );

  if (nativeBalance < fee) {
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
    console.log(
      `  Fee:         ${formatAmount(fee, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol}`
    );
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
    .option("-s, --source <chain>", "Source chain key (run 'pnpm chains' to see options)")
    .option("-d, --dest <chain>", "Destination chain key")
    .option("-t, --token <symbol>", "Token symbol to transfer", DEFAULT_TOKEN)
    .option("-a, --amount <amount>", "Amount to transfer", DEFAULT_AMOUNT)
    .option("-r, --receiver <address>", "Receiver address (defaults based on destination chain)")
    .option("-v, --verbose", "Enable verbose logging", false)
    .option("-y, --yes", "Skip confirmation prompt", false)
    .action(
      async (opts: {
        source?: string;
        dest?: string;
        token: string;
        amount: string;
        receiver?: string;
        verbose: boolean;
        yes: boolean;
      }) => {
        // Determine if using Solana based on source
        const source = opts.source
          ? validateChainKey(opts.source)
          : opts.dest?.includes("solana")
            ? DEFAULT_SOURCE_SOLANA
            : DEFAULT_SOURCE_EVM;

        const isSolana = networkInfo(source).family === ChainFamily.Solana;

        // Set defaults based on chain family
        const dest = opts.dest
          ? validateChainKey(opts.dest)
          : isSolana
            ? DEFAULT_DEST_SOLANA
            : DEFAULT_DEST_EVM;

        const options: TransferOptions = {
          source,
          dest,
          token: opts.token,
          amount: opts.amount,
          receiver: opts.receiver,
          verbose: opts.verbose,
          yes: opts.yes,
        };

        console.log("=".repeat(60));
        console.log(`CCIP SDK: Transfer Tokens Cross-Chain (${isSolana ? "Solana" : "EVM"})`);
        console.log("=".repeat(60));
        console.log();

        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
          console.error("Error: PRIVATE_KEY not set in .env file");
          console.error("For EVM: Use hex private key (with or without 0x prefix)");
          console.error("For Solana: Use base58 encoded secret key");
          process.exit(1);
        }

        try {
          const messageId = await transfer(options, privateKey);

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
          // Use SDK error types for better error handling
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
