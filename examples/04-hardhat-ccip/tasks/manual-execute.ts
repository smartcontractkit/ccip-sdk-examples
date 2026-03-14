/**
 * Task: Manually execute a failed/stuck CCIP message on the destination chain
 *
 * Uses the SDK's simplified API-based execution path: the SDK fetches
 * the execution input (merkle proofs, offchain token data) from the CCIP API
 * and submits the manual execution transaction on the destination chain.
 *
 * Typical workflow:
 *   1. Send a data-only message with a deliberately low --gas-limit (e.g. 1000)
 *   2. The message fails on destination due to out-of-gas
 *   3. Wait for the message to become eligible for manual execution
 *   4. Run this task to retry with a higher gas limit
 *
 * Usage:
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 manual-execute \
 *     --message-id 0x...
 *
 *   # With a custom gas limit override
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 manual-execute \
 *     --message-id 0x... --gas-limit 300000
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import {
  CCIPAPIClient,
  getCCIPExplorerUrl,
  CCIPError,
  CCIPMessageIdNotFoundError,
  withRetry,
} from "@chainlink/ccip-sdk";
import { fromViemClient, viemWallet } from "@chainlink/ccip-sdk/viem";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { createClients } from "../helpers/sdk.js";

interface ManualExecuteArgs {
  messageId: string;
  gasLimit: string;
}

const manualExecute = async (
  args: ManualExecuteArgs,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const connection = await hre.network.connect();
  const destNetworkId = connection.networkName;
  const { messageId } = args;

  console.log(`\nManual execution of failed CCIP message`);
  console.log(`  Destination network: ${destNetworkId}`);
  console.log(`  Message ID: ${messageId}`);
  console.log(`  CCIP Explorer: ${getCCIPExplorerUrl("msg", messageId)}`);

  // Step 1: Check message status via API
  console.log(`\n  Checking message status...`);
  const apiClient = new CCIPAPIClient();

  const request = await withRetry(() => apiClient.getMessageById(messageId), {
    maxRetries: 5,
    initialDelayMs: 2000,
    backoffMultiplier: 1.5,
    maxDelayMs: 15000,
    respectRetryAfterHint: true,
    logger: {
      debug: (...debugArgs: unknown[]) => console.log("  [retry]", ...debugArgs),
      warn: (...warnArgs: unknown[]) => console.warn("  [retry]", ...warnArgs),
    },
  });

  const { metadata } = request;
  console.log(`  Status: ${metadata.status}`);
  console.log(`  Source: ${metadata.sourceNetworkInfo.name}`);
  console.log(`  Destination: ${metadata.destNetworkInfo.name}`);

  if (metadata.status === "SUCCESS") {
    console.log(`\n  Message already executed successfully. Nothing to do.`);
    return;
  }

  if (!metadata.readyForManualExecution) {
    console.log(`\n  Message is not yet ready for manual execution.`);
    console.log(`  Current status: ${metadata.status}`);
    console.log(`  The message must be committed and blessed before it can be manually executed.`);
    console.log(`  Try again later or check the CCIP Explorer.`);
    return;
  }

  // Step 2: Estimate or resolve gas limit
  console.log(`\n  Message is ready for manual execution.`);

  const { walletClient, publicClient } = createClients(destNetworkId);
  const destChain = await fromViemClient(publicClient);

  let gasLimit: number | undefined;
  if (args.gasLimit !== "0") {
    gasLimit = Number(args.gasLimit);
    if (isNaN(gasLimit) || gasLimit <= 0) {
      throw new Error(`Invalid --gas-limit: "${args.gasLimit}". Must be a positive number.`);
    }
    console.log(`  Gas limit (manual override): ${gasLimit}`);
  } else {
    // Auto-estimate gas for ccipReceive on the destination chain.
    // The SDK fetches the message details from the API and simulates
    // ccipReceive() to determine the exact gas needed.
    console.log(`  Auto-estimating gas for ccipReceive...`);
    try {
      const estimated = await destChain.estimateReceiveExecution({ messageId });
      gasLimit = Math.ceil(estimated * 1.1);
      console.log(`  Estimated gas: ${estimated}`);
      console.log(`  Gas limit (with 10% margin): ${gasLimit}`);
    } catch (err) {
      console.log(
        `  Could not auto-estimate gas: ${err instanceof Error ? err.message : String(err)}`
      );
      console.log(`  Proceeding without gas limit override (SDK will use its default).`);
    }
  }

  console.log(`  Submitting execution transaction on ${destNetworkId}...`);

  try {
    const execution = await destChain.execute({
      messageId,
      wallet: viemWallet(walletClient),
      ...(gasLimit && { gasLimit }),
    });

    const txHash = execution.log.tx?.hash;
    console.log(`\n  Execution submitted!`);
    if (txHash) {
      console.log(`  Tx hash: ${txHash}`);
      console.log(`  Explorer: ${getExplorerTxUrl(destNetworkId, txHash)}`);
    }

    const state = execution.receipt.state;
    if (state === 2) {
      console.log(`\n  Message executed successfully!`);
    } else if (state === 3) {
      console.log(`\n  Execution reverted on destination.`);
      console.log(`  The receiver's ccipReceive may need a higher gas limit.`);
      console.log(`  Try again with: --gas-limit <higher_value>`);
    } else {
      console.log(`\n  Execution state: ${state}`);
    }
  } catch (error) {
    if (error instanceof CCIPMessageIdNotFoundError) {
      console.error(`\n  Message not found. It may not be indexed yet. Try again later.`);
    } else if (CCIPError.isCCIPError(error)) {
      console.error(`\n  Execution failed: ${error.message}`);
      if (error.recovery) {
        console.error(`  Recovery: ${error.recovery}`);
      }
    } else {
      console.error(`\n  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

export default manualExecute;
