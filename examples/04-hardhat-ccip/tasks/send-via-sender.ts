/**
 * Task: Send CCIP message through the deployed CCIPSender contract
 *
 * Demonstrates the "extraArgs passthrough" pattern:
 *   1. Build extraArgs offchain using the CCIP SDK's encodeExtraArgs()
 *   2. Pass them to the sender contract which forwards them to the router
 *
 * Gas limit is auto-estimated via the SDK's estimateReceiveExecution() when
 * not explicitly provided (for data and ptt modes).
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
 *   # Programmable token transfer (PTT) — gasLimit auto-estimated
 *   npx hardhat --network ethereum-testnet-sepolia send-via-sender \
 *     --dest ethereum-testnet-sepolia-base-1 \
 *     --sender-contract 0x... --receiver 0x... \
 *     --mode ptt --amount 0.001 --token CCIP-BnM
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { parseUnits, encodePacked, encodeAbiParameters, erc20Abi } from "viem";
import { encodeExtraArgs, estimateReceiveExecution, getCCIPExplorerUrl } from "@chainlink/ccip-sdk";
import { fromViemClient } from "@chainlink/ccip-sdk/viem";
import {
  type FeeTokenOption,
  getExplorerTxUrl,
  getTokenAddress,
  resolveFeeTokenAddress,
} from "@ccip-examples/shared-config";
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

  console.log(`\nSending CCIP message via sender contract...`);
  console.log(`  Source: ${sourceNetworkId}`);
  console.log(`  Destination: ${dest}`);
  console.log(`  Mode: ${mode}`);
  console.log(`  Receiver: ${receiver}`);

  const { account, publicClient, walletClient } = createClients(sourceNetworkId);
  const { publicClient: destPublicClient } = createClients(dest);
  const senderArtifact = await hre.artifacts.readArtifact("CCIPSender");
  const destChainSelector = getDestChainSelector(dest);
  const routerAddress = getRouterAddress(sourceNetworkId);

  // Build token amounts (for tt and ptt modes)
  interface TokenAmount {
    token: `0x${string}`;
    amount: bigint;
  }
  let tokenAmounts: TokenAmount[] = [];

  if (mode === "tt" || mode === "ptt") {
    const tokenAddress = getTokenAddress(args.token, sourceNetworkId);
    if (!tokenAddress) throw new Error(`Token ${args.token} not found on ${sourceNetworkId}`);

    const decimals = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "decimals",
    });

    const amount = parseUnits(args.amount, decimals);
    tokenAmounts = [{ token: tokenAddress as `0x${string}`, amount }];
  }

  // Build data payload
  let data: `0x${string}` = "0x";
  if (mode === "data") {
    data = encodePacked(["string"], ["Hello from CCIP!"]);
    console.log(`  Data: ${data}`);
  } else if (mode === "ptt") {
    data =
      args.data !== ""
        ? (args.data as `0x${string}`)
        : encodeAbiParameters([{ type: "address" }], [receiver as `0x${string}`]);
    console.log(`  Data (encoded address): ${data}`);
  }

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
    // Auto-estimate gas for data/ptt modes using SDK
    console.log(`\n  Estimating destination gas for ccipReceive...`);
    const sourceChain = await fromViemClient(publicClient);
    const destChain = await fromViemClient(destPublicClient);

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

    // Add 10% safety margin
    gasLimit = BigInt(Math.ceil(estimatedGas * 1.1));
    console.log(`  Gas limit (estimated): ${estimatedGas} → ${gasLimit} (with 10% margin)`);
  }

  // Build extraArgs offchain using the SDK
  const extraArgs = encodeExtraArgs({
    gasLimit,
    allowOutOfOrderExecution: true,
  }) as `0x${string}`;
  console.log(`  Extra args (encoded): ${extraArgs}`);

  const firstToken = tokenAmounts[0];
  if ((mode === "tt" || mode === "ptt") && firstToken) {
    // Approve sender contract to spend tokens
    console.log(`\n  Approving ${args.amount} ${args.token} for sender contract...`);
    const approveHash = await walletClient.writeContract({
      address: firstToken.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [args.senderContract as `0x${string}`, firstToken.amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`  Approved.`);
  }

  // Resolve fee token
  const feeTokenOption = args.feeToken as FeeTokenOption;
  const feeTokenAddress = resolveFeeTokenAddress(feeTokenOption, sourceNetworkId);
  const feeTokenForContract = feeTokenAddress
    ? (feeTokenAddress as `0x${string}`)
    : ("0x0000000000000000000000000000000000000000" as `0x${string}`);

  // If paying with LINK, approve sender contract for fees
  if (feeTokenAddress) {
    console.log(`\n  Approving LINK for fee payment...`);
    const approveFeeHash = await walletClient.writeContract({
      address: feeTokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [args.senderContract as `0x${string}`, parseUnits("1", 18)], // 1 LINK max
    });
    await publicClient.waitForTransactionReceipt({ hash: approveFeeHash });
    console.log(`  LINK approved for fees.`);
  }

  // Send the message
  console.log(`\n  Sending CCIP message...`);
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
    value: feeTokenAddress ? 0n : parseUnits("0.01", 18), // Send extra native for fees
    account,
  });

  console.log(`  Tx hash: ${sendHash}`);
  console.log(`  Explorer: ${getExplorerTxUrl(sourceNetworkId, sendHash)}`);

  // Extract messageId using the SDK's getMessagesInTx
  const chain = await fromViemClient(publicClient);
  const requests = await chain.getMessagesInTx(sendHash);

  const firstRequest = requests[0];
  if (firstRequest) {
    const messageId = firstRequest.message.messageId;
    console.log(`\n  Message ID: ${messageId}`);
    console.log(`  CCIP Explorer: ${getCCIPExplorerUrl("msg", messageId)}`);
    console.log(`\n  Track status with:`);
    console.log(`    npx hardhat check-status --message-id ${messageId}`);
  }

  console.log(`\nDone! Message sent via sender contract.`);
};

export default sendViaSender;
