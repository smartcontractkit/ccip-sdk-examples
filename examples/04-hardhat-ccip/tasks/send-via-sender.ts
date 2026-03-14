/**
 * Task: Send CCIP message through the deployed CCIPSender contract
 *
 * Demonstrates the "extraArgs passthrough" pattern:
 *   1. Build extraArgs offchain using the CCIP SDK's encodeExtraArgs()
 *   2. Estimate the destination gas limit for ccipReceive via estimateReceiveExecution()
 *   3. Estimate the CCIP fee via getFee() and display it in human-readable format
 *   4. Pass everything to the sender contract which forwards to the router
 *
 * Supports both native and LINK fee payment. Gas limit is auto-estimated via
 * the SDK for data and ptt modes.
 *
 * Usage:
 *   # Token transfer (TT) — gasLimit auto 0
 *   npx hardhat --network ethereum-testnet-sepolia send-via-sender \
 *     --dest ethereum-testnet-sepolia-base-1 \
 *     --sender-contract 0x... --receiver 0x... \
 *     --mode tt --amount 0.001 --token CCIP-BnM
 *
 *   # Data-only — gasLimit auto-estimated
 *   npx hardhat --network ethereum-testnet-sepolia send-via-sender \
 *     --dest ethereum-testnet-sepolia-base-1 \
 *     --sender-contract 0x... --receiver 0x... \
 *     --mode data
 *
 *   # Programmable token transfer (PTT) — gasLimit auto-estimated, pay with LINK
 *   npx hardhat --network ethereum-testnet-sepolia send-via-sender \
 *     --dest ethereum-testnet-sepolia-base-1 \
 *     --sender-contract 0x... --receiver 0x... \
 *     --mode ptt --amount 0.001 --token CCIP-BnM --fee-token link
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { parseUnits, encodePacked, encodeAbiParameters, erc20Abi } from "viem";
import {
  encodeExtraArgs,
  estimateReceiveExecution,
  getCCIPExplorerUrl,
  withRetry,
} from "@chainlink/ccip-sdk";
import { fromViemClient } from "@chainlink/ccip-sdk/viem";
import {
  type FeeTokenOption,
  NETWORKS,
  getExplorerTxUrl,
  getTokenAddress,
  resolveFeeTokenAddress,
} from "@ccip-examples/shared-config";
import { formatAmount, formatLatency } from "@ccip-examples/shared-utils";
import { createClients, getRouterAddress, getDestChainSelector } from "../helpers/sdk.js";

interface SendViaSenderArgs {
  dest: string;
  senderContract: string;
  receiver: string;
  mode: string;
  amount: string;
  token: string;
  feeToken: string;
  gasLimit: string;
  data: string;
}

const sendViaSender = async (
  args: SendViaSenderArgs,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const connection = await hre.network.connect();
  const sourceNetworkId = connection.networkName;
  const { mode, dest, receiver } = args;
  const sourceConfig = NETWORKS[sourceNetworkId];
  if (!sourceConfig) throw new Error(`Unknown source network: ${sourceNetworkId}`);

  // Validate mode early
  const validModes = ["tt", "data", "ptt"];
  if (!validModes.includes(mode)) {
    throw new Error(`Invalid mode: "${mode}". Must be one of: ${validModes.join(", ")}`);
  }

  // Validate gasLimit if provided
  if (args.gasLimit !== "0") {
    const parsed = Number(args.gasLimit);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(`Invalid --gas-limit: "${args.gasLimit}". Must be a non-negative number.`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("CCIP Message via Sender Contract (extraArgs passthrough)");
  console.log("=".repeat(60));
  console.log(`  Source:      ${sourceConfig.name} (${sourceNetworkId})`);
  console.log(`  Destination: ${dest}`);
  console.log(`  Mode:        ${mode}`);
  console.log(`  Receiver:    ${receiver}`);
  console.log(`  Fee token:   ${args.feeToken}`);

  // ──────────────────────────────────────────────
  // Step 1: Initialize SDK clients
  // ──────────────────────────────────────────────
  console.log("\nStep 1: Initializing SDK clients...");
  const { account, publicClient, walletClient } = createClients(sourceNetworkId);
  const { publicClient: destPublicClient } = createClients(dest);
  const senderArtifact = await hre.artifacts.readArtifact("CCIPSender");
  const destChainSelector = getDestChainSelector(dest);
  const routerAddress = getRouterAddress(sourceNetworkId);

  const sourceChain = await fromViemClient(publicClient);
  const destChain = await fromViemClient(destPublicClient);
  console.log(`  Wallet: ${account.address}`);

  // Estimate lane latency (informational)
  try {
    const latency = await sourceChain.getLaneLatency(destChainSelector);
    console.log(`  Estimated delivery: ${formatLatency(latency.totalMs)}`);
  } catch {
    // Lane latency is informational — don't block the send
  }

  // ──────────────────────────────────────────────
  // Step 2: Prepare message payload (tokens + data)
  // ──────────────────────────────────────────────
  console.log("\nStep 2: Preparing message payload...");

  interface TokenAmount {
    token: `0x${string}`;
    amount: bigint;
  }
  let tokenAmounts: TokenAmount[] = [];
  let tokenSymbol = "";
  let tokenDecimals = 18;

  if (mode === "tt" || mode === "ptt") {
    const tokenAddress = getTokenAddress(args.token, sourceNetworkId);
    if (!tokenAddress) throw new Error(`Token ${args.token} not found on ${sourceNetworkId}`);

    const decimals = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    });
    tokenSymbol = args.token;
    tokenDecimals = decimals;

    const amount = parseUnits(args.amount, decimals);
    tokenAmounts = [{ token: tokenAddress as `0x${string}`, amount }];
    console.log(`  Token: ${tokenSymbol} (${tokenAddress})`);
    console.log(`  Amount: ${args.amount} ${tokenSymbol} (${amount} smallest unit)`);
  }

  // Build data payload
  let data: `0x${string}` = "0x";
  if (mode === "data") {
    data = encodePacked(["string"], ["Hello from CCIP!"]);
    console.log(`  Data payload: ${data}`);
    console.log(`  (Encoded string: "Hello from CCIP!")`);
  } else if (mode === "ptt") {
    data =
      args.data !== ""
        ? (args.data as `0x${string}`)
        : encodeAbiParameters([{ type: "address" }], [account.address]);
    console.log(`  Data payload (encoded address): ${data}`);
  } else if (mode === "tt") {
    console.log(`  Data payload: (none — token-only transfer)`);
  }

  // ──────────────────────────────────────────────
  // Step 3: Estimate destination gas limit
  // ──────────────────────────────────────────────
  console.log("\nStep 3: Estimating destination gas for ccipReceive...");

  let gasLimit: bigint;
  if (args.gasLimit !== "0") {
    gasLimit = BigInt(args.gasLimit);
    console.log(`  Gas limit (manual override): ${gasLimit}`);
  } else if (mode === "tt") {
    // Token-only transfers don't execute receiver logic — the router
    // delivers tokens directly without calling ccipReceive()
    gasLimit = 0n;
    console.log(`  Gas limit: 0 (token-only transfer — no receiver execution needed)`);
  } else {
    // Auto-estimate gas for data/ptt modes using the SDK's estimateReceiveExecution.
    // This simulates ccipReceive() on the destination chain to determine the exact
    // gas needed, then we add a 10% safety margin.
    const estimatedGas = await estimateReceiveExecution({
      source: sourceChain,
      dest: destChain,
      routerOrRamp: routerAddress,
      message: {
        sender: args.senderContract,
        receiver,
        data,
        tokenAmounts: tokenAmounts.map((ta) => ({
          token: ta.token,
          amount: ta.amount,
        })),
      },
    });

    gasLimit = BigInt(Math.ceil(estimatedGas * 1.1));
    console.log(`  Estimated gas: ${estimatedGas}`);
    console.log(`  Gas limit (with 10% margin): ${gasLimit}`);
  }

  // ──────────────────────────────────────────────
  // Step 4: Encode extraArgs
  // ──────────────────────────────────────────────
  console.log("\nStep 4: Encoding extraArgs (offchain via SDK)...");
  const extraArgs = encodeExtraArgs({
    gasLimit,
    allowOutOfOrderExecution: true,
  }) as `0x${string}`;
  console.log(`  extraArgs: ${extraArgs}`);
  console.log(`  (gasLimit=${gasLimit}, allowOutOfOrderExecution=true)`);

  // ──────────────────────────────────────────────
  // Step 5: Approve token spending (if needed)
  // ──────────────────────────────────────────────
  const firstToken = tokenAmounts[0];
  if ((mode === "tt" || mode === "ptt") && firstToken) {
    console.log(`\nStep 5: Approving ${args.amount} ${tokenSymbol} for sender contract...`);
    const approveHash = await walletClient.writeContract({
      address: firstToken.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [args.senderContract as `0x${string}`, firstToken.amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`  Approved: ${getExplorerTxUrl(sourceNetworkId, approveHash)}`);
  } else {
    console.log("\nStep 5: Token approval — skipped (no tokens in this message)");
  }

  // ──────────────────────────────────────────────
  // Step 6: Estimate CCIP fee
  // ──────────────────────────────────────────────
  console.log("\nStep 6: Estimating CCIP fee...");

  // Resolve fee token address: "native" → undefined, "link" → LINK address
  const feeTokenOption = args.feeToken as FeeTokenOption;
  const feeTokenAddress = resolveFeeTokenAddress(feeTokenOption, sourceNetworkId);
  const feeTokenForContract = feeTokenAddress
    ? (feeTokenAddress as `0x${string}`)
    : ("0x0000000000000000000000000000000000000000" as `0x${string}`);

  // Resolve fee token metadata for human-readable display
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

  // Estimate fee using the SDK — this mirrors the router.getFee() call
  // that the sender contract makes on-chain
  const fee = await sourceChain.getFee({
    router: routerAddress,
    destChainSelector,
    message: {
      receiver,
      data,
      tokenAmounts: tokenAmounts.map((ta) => ({ token: ta.token, amount: ta.amount })),
      extraArgs: { gasLimit, allowOutOfOrderExecution: true },
      ...(feeTokenAddress && { feeToken: feeTokenAddress }),
    },
  });

  // Add 10% buffer — the sender contract calls router.getFee() on-chain
  // and refunds any excess
  const feeWithBuffer = (fee * 110n) / 100n;
  console.log(`  Estimated fee: ${formatAmount(fee, feeDecimals)} ${feeSymbol}`);
  console.log(`  Fee with 10% buffer: ${formatAmount(feeWithBuffer, feeDecimals)} ${feeSymbol}`);
  console.log(`  (Excess is refunded by the sender contract)`);

  // ──────────────────────────────────────────────
  // Step 7: Check balances
  // ──────────────────────────────────────────────
  console.log("\nStep 7: Checking balances...");
  const nativeBalance = await sourceChain.getBalance({ holder: account.address });
  console.log(
    `  Native balance:  ${formatAmount(nativeBalance, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol}`
  );

  if (firstToken) {
    const tokenBalance = await sourceChain.getBalance({
      holder: account.address,
      token: firstToken.token,
    });
    console.log(`  Token balance:   ${formatAmount(tokenBalance, tokenDecimals)} ${tokenSymbol}`);
    if (tokenBalance < firstToken.amount) {
      throw new Error(
        `Insufficient ${tokenSymbol} balance: have ${formatAmount(tokenBalance, tokenDecimals)}, need ${args.amount}`
      );
    }
  }

  if (feeTokenAddress) {
    const feeTokenBalance = await sourceChain.getBalance({
      holder: account.address,
      token: feeTokenAddress,
    });
    console.log(`  Fee token balance: ${formatAmount(feeTokenBalance, feeDecimals)} ${feeSymbol}`);
    if (feeTokenBalance < feeWithBuffer) {
      throw new Error(
        `Insufficient ${feeSymbol} for fee: have ${formatAmount(feeTokenBalance, feeDecimals)}, need ${formatAmount(feeWithBuffer, feeDecimals)}`
      );
    }
  } else if (nativeBalance < feeWithBuffer) {
    throw new Error(
      `Insufficient ${sourceConfig.nativeCurrency.symbol} for fee: have ${formatAmount(nativeBalance, sourceConfig.nativeCurrency.decimals)}, need ${formatAmount(feeWithBuffer, feeDecimals)}`
    );
  }

  // Estimate balance after send
  if (feeTokenAddress) {
    console.log(
      `  After send (est): ~${formatAmount(nativeBalance, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol} (gas only)`
    );
    const feeTokenBalance = await sourceChain.getBalance({
      holder: account.address,
      token: feeTokenAddress,
    });
    console.log(
      `                    ~${formatAmount(feeTokenBalance - feeWithBuffer, feeDecimals)} ${feeSymbol}`
    );
  } else {
    console.log(
      `  After send (est): ~${formatAmount(nativeBalance - feeWithBuffer, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol}`
    );
  }

  // ──────────────────────────────────────────────
  // Step 8: Approve LINK for fees (if paying with LINK)
  // ──────────────────────────────────────────────
  if (feeTokenAddress) {
    console.log(
      `\nStep 8: Approving ${formatAmount(feeWithBuffer, feeDecimals)} ${feeSymbol} for fee payment...`
    );
    const approveFeeHash = await walletClient.writeContract({
      address: feeTokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [args.senderContract as `0x${string}`, feeWithBuffer],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveFeeHash });
    console.log(`  Approved: ${getExplorerTxUrl(sourceNetworkId, approveFeeHash)}`);
  } else {
    console.log("\nStep 8: LINK fee approval — skipped (paying with native token)");
  }

  // ──────────────────────────────────────────────
  // Transfer Summary
  // ──────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("Transfer Summary:");
  console.log(`  Mode:        ${mode}`);
  console.log(`  From:        ${sourceConfig.name}`);
  console.log(`  To:          ${dest}`);
  console.log(`  Receiver:    ${receiver}`);
  if (firstToken) {
    console.log(`  Amount:      ${args.amount} ${tokenSymbol}`);
  }
  console.log(`  Gas limit:   ${gasLimit}`);
  console.log(`  Fee:         ~${formatAmount(feeWithBuffer, feeDecimals)} ${feeSymbol}`);
  console.log(
    `  Fee payment: ${feeTokenAddress ? `LINK (${feeTokenAddress})` : `native (${feeSymbol})`}`
  );
  console.log("=".repeat(60));

  // ──────────────────────────────────────────────
  // Step 9: Send the CCIP message
  // ──────────────────────────────────────────────
  console.log("\nStep 9: Sending CCIP message via sender contract...");
  const sendHash = await walletClient.writeContract({
    address: args.senderContract as `0x${string}`,
    abi: senderArtifact.abi,
    functionName: "send",
    args: [
      destChainSelector,
      receiver as `0x${string}`,
      data,
      tokenAmounts,
      extraArgs,
      feeTokenForContract,
    ],
    value: feeTokenAddress ? 0n : feeWithBuffer,
    account,
  });

  console.log(`  Tx submitted: ${sendHash}`);
  console.log(`  Waiting for on-chain confirmation...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: sendHash });
  console.log(`  Confirmed in block ${receipt.blockNumber}`);
  console.log(`  Block explorer: ${getExplorerTxUrl(sourceNetworkId, sendHash)}`);

  // ──────────────────────────────────────────────
  // Step 10: Extract message ID and track
  // ──────────────────────────────────────────────
  console.log("\nStep 10: Extracting CCIP message ID from transaction logs...");
  try {
    // getMessagesInTx parses the CCIPSendRequested event from the transaction
    // receipt logs — no API call needed. We waited for the receipt above so
    // the logs are guaranteed to be available.
    const requests = await withRetry(() => sourceChain.getMessagesInTx(sendHash), {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 1.5,
      respectRetryAfterHint: true,
      logger: {
        debug: (...logArgs: unknown[]) => console.log("  [retry]", ...logArgs),
        warn: (...logArgs: unknown[]) => console.warn("  [retry]", ...logArgs),
      },
    });

    const firstRequest = requests[0];
    if (firstRequest) {
      const messageId = firstRequest.message.messageId;
      console.log(`  Message ID: ${messageId}`);
      console.log(`  CCIP Explorer: ${getCCIPExplorerUrl("msg", messageId)}`);
      console.log(`\n  Track delivery status with:`);
      console.log(`    npx hardhat check-status --message-id ${messageId}`);
    }
  } catch (err) {
    console.warn(
      `  Could not extract message ID: ${err instanceof Error ? err.message : String(err)}`
    );
    console.log(`  You can find your message on the CCIP Explorer using the tx hash above.`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done! Message sent via sender contract.");
  console.log("=".repeat(60) + "\n");
};

export default sendViaSender;
