/**
 * Task: Send CCIP message directly through the router using the SDK
 *
 * Demonstrates the SDK-managed approach — the SDK builds the complete message,
 * handles token approvals, and interacts with the router directly.
 * No custom sender contract needed.
 *
 * Key SDK features demonstrated:
 *   - estimateReceiveExecution() — auto-estimates destination gas for ccipReceive
 *   - getFee() — estimates CCIP fee in native or LINK with human-readable display
 *   - sendMessage() — handles approvals + ccipSend in one call
 *   - MessageInput type — strongly typed message construction
 *
 * Usage:
 *   # Token transfer — gasLimit auto 0
 *   npx hardhat --network ethereum-testnet-sepolia send-via-router \
 *     --dest ethereum-testnet-sepolia-base-1 \
 *     --receiver 0x... --mode tt --amount 0.001 --token CCIP-BnM
 *
 *   # Data-only — gasLimit auto-estimated
 *   npx hardhat --network ethereum-testnet-sepolia send-via-router \
 *     --dest ethereum-testnet-sepolia-base-1 \
 *     --receiver 0x... --mode data
 *
 *   # Programmable token transfer — gasLimit auto-estimated, pay with LINK
 *   npx hardhat --network ethereum-testnet-sepolia send-via-router \
 *     --dest ethereum-testnet-sepolia-base-1 \
 *     --receiver 0x... --mode ptt --amount 0.001 --token CCIP-BnM --fee-token link
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { encodePacked, encodeAbiParameters, parseUnits } from "viem";
import {
  type MessageInput,
  estimateReceiveExecution,
  getCCIPExplorerUrl,
} from "@chainlink/ccip-sdk";
import { fromViemClient, viemWallet } from "@chainlink/ccip-sdk/viem";
import {
  type FeeTokenOption,
  NETWORKS,
  getExplorerTxUrl,
  getTokenAddress,
  resolveFeeTokenAddress,
} from "@ccip-examples/shared-config";
import {
  buildTokenTransferMessage,
  formatAmount,
  formatLatency,
} from "@ccip-examples/shared-utils";
import { createClients, getRouterAddress, getDestChainSelector } from "../helpers/sdk.js";

interface SendViaRouterArgs {
  dest: string;
  receiver: string;
  mode: string;
  amount: string;
  token: string;
  feeToken: string;
  gasLimit: string;
  data: string;
}

const sendViaRouter = async (
  args: SendViaRouterArgs,
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
  console.log("CCIP Message via Router (SDK-managed)");
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
  const routerAddress = getRouterAddress(sourceNetworkId);
  const destChainSelector = getDestChainSelector(dest);

  const { account, publicClient, walletClient } = createClients(sourceNetworkId);
  const { publicClient: destPublicClient } = createClients(dest);
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

  // Resolve fee token: "native" → undefined, "link" → LINK address
  const feeTokenOption = args.feeToken as FeeTokenOption;
  const feeToken = resolveFeeTokenAddress(feeTokenOption, sourceNetworkId);

  // Resolve fee token metadata for human-readable display
  let feeDecimals: number;
  let feeSymbol: string;

  if (feeToken) {
    const feeTokenInfo = await sourceChain.getTokenInfo(feeToken);
    feeDecimals = feeTokenInfo.decimals;
    feeSymbol = feeTokenInfo.symbol;
  } else {
    feeDecimals = sourceConfig.nativeCurrency.decimals;
    feeSymbol = sourceConfig.nativeCurrency.symbol;
  }
  console.log(`  Fee token: ${feeSymbol}${feeToken ? ` (${feeToken})` : " (native)"}`);

  // ──────────────────────────────────────────────
  // Step 2: Estimate destination gas limit
  // ──────────────────────────────────────────────
  console.log("\nStep 2: Estimating destination gas for ccipReceive...");

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
    // Build a preliminary payload for gas estimation.
    // estimateReceiveExecution() simulates ccipReceive() on the destination
    // chain to determine the exact gas needed.
    let estimationData = "0x";
    const estimationTokenAmounts: { token: string; amount: bigint }[] = [];

    if (mode === "data") {
      estimationData = encodePacked(["string"], ["Hello from CCIP!"]);
    } else if (mode === "ptt") {
      const tokenAddress = getTokenAddress(args.token, sourceNetworkId);
      if (!tokenAddress) throw new Error(`Token ${args.token} not found on ${sourceNetworkId}`);
      const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
      const amount = parseUnits(args.amount, tokenInfo.decimals);
      estimationData =
        args.data !== ""
          ? args.data
          : encodeAbiParameters([{ type: "address" }], [account.address]);
      estimationTokenAmounts.push({ token: tokenAddress, amount });
    }

    const estimatedGas = await estimateReceiveExecution({
      source: sourceChain,
      dest: destChain,
      routerOrRamp: routerAddress,
      message: {
        sender: account.address,
        receiver,
        data: estimationData,
        tokenAmounts: estimationTokenAmounts,
      },
    });

    // Add 10% safety margin on top of the SDK's estimate
    gasLimit = BigInt(Math.ceil(estimatedGas * 1.1));
    console.log(`  Estimated gas: ${estimatedGas}`);
    console.log(`  Gas limit (with 10% margin): ${gasLimit}`);
  }

  // ──────────────────────────────────────────────
  // Step 3: Build CCIP message (strongly typed MessageInput)
  // ──────────────────────────────────────────────
  console.log("\nStep 3: Building CCIP message...");

  let message: MessageInput;
  let tokenSymbol = "";

  if (mode === "tt") {
    // Token transfer — use shared-utils helper for typed message construction
    const tokenAddress = getTokenAddress(args.token, sourceNetworkId);
    if (!tokenAddress) throw new Error(`Token ${args.token} not found on ${sourceNetworkId}`);

    const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
    const amount = parseUnits(args.amount, tokenInfo.decimals);
    tokenSymbol = tokenInfo.symbol;

    message = buildTokenTransferMessage({
      receiver,
      tokenAddress,
      amount,
      feeToken,
    });
    console.log(`  Token: ${tokenInfo.symbol} (${tokenAddress})`);
    console.log(`  Amount: ${args.amount} ${tokenInfo.symbol} (${amount} smallest unit)`);
    console.log(`  Data payload: (none — token-only transfer)`);
  } else if (mode === "data") {
    // Data-only message — no tokens, just arbitrary data
    const dataPayload = encodePacked(["string"], ["Hello from CCIP!"]);
    message = {
      receiver,
      data: dataPayload,
      extraArgs: { gasLimit, allowOutOfOrderExecution: true },
      ...(feeToken && { feeToken }),
    };
    console.log(`  Data payload: ${dataPayload}`);
    console.log(`  (Encoded string: "Hello from CCIP!")`);
    console.log(`  Gas limit: ${gasLimit}`);
  } else if (mode === "ptt") {
    // Programmable token transfer — data + tokens
    const tokenAddress = getTokenAddress(args.token, sourceNetworkId);
    if (!tokenAddress) throw new Error(`Token ${args.token} not found on ${sourceNetworkId}`);

    const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
    const amount = parseUnits(args.amount, tokenInfo.decimals);
    tokenSymbol = tokenInfo.symbol;
    const dataPayload =
      args.data !== "" ? args.data : encodeAbiParameters([{ type: "address" }], [account.address]);

    message = {
      receiver,
      data: dataPayload,
      tokenAmounts: [{ token: tokenAddress, amount }],
      extraArgs: { gasLimit, allowOutOfOrderExecution: true },
      ...(feeToken && { feeToken }),
    };
    console.log(`  Token: ${tokenInfo.symbol} (${tokenAddress})`);
    console.log(`  Amount: ${args.amount} ${tokenInfo.symbol} (${amount} smallest unit)`);
    console.log(`  Data payload: ${dataPayload}`);
    console.log(`  Gas limit: ${gasLimit}`);
  } else {
    throw new Error(`Unknown mode: ${mode}. Use tt, data, or ptt.`);
  }

  // ──────────────────────────────────────────────
  // Step 4: Estimate CCIP fee
  // ──────────────────────────────────────────────
  console.log("\nStep 4: Estimating CCIP fee...");
  const fee = await sourceChain.getFee({
    router: routerAddress,
    destChainSelector,
    message,
  });
  console.log(`  Estimated fee: ${formatAmount(fee, feeDecimals)} ${feeSymbol}`);

  // ──────────────────────────────────────────────
  // Step 5: Check balances
  // ──────────────────────────────────────────────
  console.log("\nStep 5: Checking balances...");
  const nativeBalance = await sourceChain.getBalance({ holder: account.address });
  console.log(
    `  Native balance:  ${formatAmount(nativeBalance, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol}`
  );

  if (mode === "tt" || mode === "ptt") {
    const tokenAddress = getTokenAddress(args.token, sourceNetworkId);
    if (tokenAddress) {
      const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
      const tokenBalance = await sourceChain.getBalance({
        holder: account.address,
        token: tokenAddress,
      });
      const parsedAmount = parseUnits(args.amount, tokenInfo.decimals);
      console.log(
        `  Token balance:   ${formatAmount(tokenBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`
      );
      if (tokenBalance < parsedAmount) {
        throw new Error(
          `Insufficient ${tokenInfo.symbol} balance: have ${formatAmount(tokenBalance, tokenInfo.decimals)}, need ${args.amount}`
        );
      }
    }
  }

  if (feeToken) {
    const feeTokenBalance = await sourceChain.getBalance({
      holder: account.address,
      token: feeToken,
    });
    console.log(`  Fee token balance: ${formatAmount(feeTokenBalance, feeDecimals)} ${feeSymbol}`);
    if (feeTokenBalance < fee) {
      throw new Error(
        `Insufficient ${feeSymbol} for fee: have ${formatAmount(feeTokenBalance, feeDecimals)}, need ${formatAmount(fee, feeDecimals)}`
      );
    }
    console.log(
      `  After send (est): ~${formatAmount(nativeBalance, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol} (gas only)`
    );
    console.log(
      `                    ~${formatAmount(feeTokenBalance - fee, feeDecimals)} ${feeSymbol}`
    );
  } else {
    if (nativeBalance < fee) {
      throw new Error(
        `Insufficient ${sourceConfig.nativeCurrency.symbol} for fee: have ${formatAmount(nativeBalance, sourceConfig.nativeCurrency.decimals)}, need ${formatAmount(fee, feeDecimals)}`
      );
    }
    console.log(
      `  After send (est): ~${formatAmount(nativeBalance - fee, sourceConfig.nativeCurrency.decimals)} ${sourceConfig.nativeCurrency.symbol}`
    );
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
  if (tokenSymbol) {
    console.log(`  Amount:      ${args.amount} ${tokenSymbol}`);
  }
  console.log(`  Gas limit:   ${gasLimit}`);
  console.log(`  Fee:         ${formatAmount(fee, feeDecimals)} ${feeSymbol}`);
  console.log(`  Fee payment: ${feeToken ? `LINK (${feeToken})` : `native (${feeSymbol})`}`);
  console.log("=".repeat(60));

  // ──────────────────────────────────────────────
  // Step 6: Send message via SDK
  // ──────────────────────────────────────────────
  // The SDK's sendMessage() handles token approvals (if needed) and
  // calls router.ccipSend() in one step. It returns the tx hash and
  // the parsed CCIP message with messageId.
  console.log("\nStep 6: Sending CCIP message via router...");
  console.log(`  (SDK handles token approvals + ccipSend in one call)`);

  const result = await sourceChain.sendMessage({
    router: routerAddress,
    destChainSelector,
    message: { ...message, fee },
    wallet: viemWallet(walletClient),
  });

  const txHash = result.tx.hash;
  console.log(`  Tx confirmed: ${txHash}`);
  console.log(`  Block explorer: ${getExplorerTxUrl(sourceNetworkId, txHash)}`);

  // ──────────────────────────────────────────────
  // Step 7: Track message
  // ──────────────────────────────────────────────
  // sendMessage() already parses the CCIPSendRequested event and returns
  // the messageId — no need for a separate getMessagesInTx call.
  const messageId = result.message.messageId;
  console.log(`\nStep 7: Message submitted successfully!`);
  console.log(`  Message ID: ${messageId}`);
  console.log(`  CCIP Explorer: ${getCCIPExplorerUrl("msg", messageId)}`);
  console.log(`\n  Track delivery status with:`);
  console.log(`    npx hardhat check-status --message-id ${messageId}`);

  console.log("\n" + "=".repeat(60));
  console.log("Done! Message sent directly via router.");
  console.log("=".repeat(60) + "\n");
};

export default sendViaRouter;
