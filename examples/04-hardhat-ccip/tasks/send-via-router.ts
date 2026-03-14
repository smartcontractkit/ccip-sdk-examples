/**
 * Task: Send CCIP message directly through the router using the SDK
 *
 * Demonstrates the SDK building the complete message and interacting with
 * the router directly (no custom sender contract needed).
 *
 * Gas limit is auto-estimated via the SDK's estimateReceiveExecution() when
 * not explicitly provided (for data and ptt modes).
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
 *   # Programmable token transfer — gasLimit auto-estimated
 *   npx hardhat --network ethereum-testnet-sepolia send-via-router \
 *     --dest ethereum-testnet-sepolia-base-1 \
 *     --receiver 0x... --mode ptt --amount 0.001 --token CCIP-BnM
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
  getExplorerTxUrl,
  getTokenAddress,
  resolveFeeTokenAddress,
} from "@ccip-examples/shared-config";
import { buildTokenTransferMessage } from "@ccip-examples/shared-utils";
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

  console.log(`\nSending CCIP message directly via router (SDK)...`);
  console.log(`  Source: ${sourceNetworkId}`);
  console.log(`  Destination: ${dest}`);
  console.log(`  Mode: ${mode}`);
  console.log(`  Receiver: ${receiver}`);

  const routerAddress = getRouterAddress(sourceNetworkId);
  const destChainSelector = getDestChainSelector(dest);

  // Create viem clients and SDK chains for source and destination
  const { account, publicClient, walletClient } = createClients(sourceNetworkId);
  const { publicClient: destPublicClient } = createClients(dest);
  const sourceChain = await fromViemClient(publicClient);
  const destChain = await fromViemClient(destPublicClient);

  // Resolve fee token
  const feeTokenOption = args.feeToken as FeeTokenOption;
  const feeToken = resolveFeeTokenAddress(feeTokenOption, sourceNetworkId);

  // Determine gasLimit: use provided value or auto-estimate via SDK
  let gasLimit: bigint;
  if (args.gasLimit !== "0") {
    gasLimit = BigInt(args.gasLimit);
    console.log(`  Gas limit (manual): ${gasLimit}`);
  } else if (mode === "tt") {
    // Token-only transfers don't execute receiver logic
    gasLimit = 0n;
    console.log(`  Gas limit: 0 (token-only, no receiver execution)`);
  } else {
    // Build a preliminary data payload for estimation
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
          : encodeAbiParameters([{ type: "address" }], [receiver as `0x${string}`]);
      estimationTokenAmounts.push({ token: tokenAddress, amount });
    }

    console.log(`\n  Estimating destination gas for ccipReceive...`);
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

    // Add 10% safety margin
    gasLimit = BigInt(Math.ceil(estimatedGas * 1.1));
    console.log(`  Gas limit (estimated): ${estimatedGas} → ${gasLimit} (with 10% margin)`);
  }

  // Build message based on mode
  let message: MessageInput;

  if (mode === "tt") {
    // Token transfer - use shared-utils helper
    const tokenAddress = getTokenAddress(args.token, sourceNetworkId);
    if (!tokenAddress) throw new Error(`Token ${args.token} not found on ${sourceNetworkId}`);

    const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
    const amount = parseUnits(args.amount, tokenInfo.decimals);

    message = buildTokenTransferMessage({
      receiver,
      tokenAddress,
      amount,
      feeToken,
    });
    console.log(`  Token: ${tokenInfo.symbol} (${tokenAddress})`);
    console.log(`  Amount: ${args.amount}`);
  } else if (mode === "data") {
    // Data-only message
    const dataPayload = encodePacked(["string"], ["Hello from CCIP!"]);
    message = {
      receiver,
      data: dataPayload,
      extraArgs: { gasLimit, allowOutOfOrderExecution: true },
      ...(feeToken && { feeToken }),
    };
    console.log(`  Data: ${dataPayload}`);
    console.log(`  Gas limit: ${gasLimit}`);
  } else if (mode === "ptt") {
    // Programmable token transfer
    const tokenAddress = getTokenAddress(args.token, sourceNetworkId);
    if (!tokenAddress) throw new Error(`Token ${args.token} not found on ${sourceNetworkId}`);

    const tokenInfo = await sourceChain.getTokenInfo(tokenAddress);
    const amount = parseUnits(args.amount, tokenInfo.decimals);
    const dataPayload =
      args.data !== ""
        ? args.data
        : encodeAbiParameters([{ type: "address" }], [receiver as `0x${string}`]);

    message = {
      receiver,
      data: dataPayload,
      tokenAmounts: [{ token: tokenAddress, amount }],
      extraArgs: { gasLimit, allowOutOfOrderExecution: true },
      ...(feeToken && { feeToken }),
    };
    console.log(`  Token: ${tokenInfo.symbol}, Amount: ${args.amount}`);
    console.log(`  Data: ${dataPayload}`);
    console.log(`  Gas limit: ${gasLimit}`);
  } else {
    throw new Error(`Unknown mode: ${mode}. Use tt, data, or ptt.`);
  }

  // Get fee estimate
  console.log(`\n  Estimating fee...`);
  const fee = await sourceChain.getFee({
    router: routerAddress,
    destChainSelector,
    message,
  });
  console.log(`  Fee: ${fee} (smallest unit)`);

  // Send message using SDK (handles approvals + ccipSend)
  console.log(`\n  Sending message from ${account.address}...`);

  const result = await sourceChain.sendMessage({
    router: routerAddress,
    destChainSelector,
    message: { ...message, fee },
    wallet: viemWallet(walletClient),
  });

  const txHash = result.tx.hash;
  console.log(`  Tx hash: ${txHash}`);
  console.log(`  Explorer: ${getExplorerTxUrl(sourceNetworkId, txHash)}`);

  // Extract messageId from the result
  const messageId = result.message.messageId;
  console.log(`\n  Message ID: ${messageId}`);
  console.log(`  CCIP Explorer: ${getCCIPExplorerUrl("msg", messageId)}`);
  console.log(`\n  Track status with:`);
  console.log(`    npx hardhat check-status --message-id ${messageId}`);

  console.log(`\nDone! Message sent directly via router.`);
};

export default sendViaRouter;
