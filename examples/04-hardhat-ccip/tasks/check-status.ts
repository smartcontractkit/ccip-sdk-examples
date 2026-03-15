/**
 * Task: Check CCIP message delivery status
 *
 * Uses the CCIP API client from the SDK to query message status
 * with built-in retry logic for transient errors.
 *
 * Usage:
 *   npx hardhat check-status --message-id 0x...
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import {
  CCIPAPIClient,
  getCCIPExplorerUrl,
  CCIPMessageIdNotFoundError,
  CCIPError,
  withRetry,
} from "@chainlink/ccip-sdk";
import { getStatusDescription, POLLING_CONFIG } from "@ccip-examples/shared-config";

interface CheckStatusArgs {
  messageId: string;
}

const checkStatus = async (
  args: CheckStatusArgs,
  _hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const { messageId } = args;

  console.log(`\nChecking status for message: ${messageId}`);
  console.log(`  CCIP Explorer: ${getCCIPExplorerUrl("msg", messageId)}`);
  console.log(`\nQuerying CCIP API (with retry for transient errors)...\n`);

  const apiClient = new CCIPAPIClient();

  try {
    // Use SDK's built-in retry logic for transient errors (e.g. indexing delay)
    const request = await withRetry(() => apiClient.getMessageById(messageId), {
      maxRetries: Math.min(POLLING_CONFIG.maxNotFoundRetries, 10),
      initialDelayMs: POLLING_CONFIG.initialDelay,
      maxDelayMs: POLLING_CONFIG.maxDelay,
      backoffMultiplier: 1.5,
      respectRetryAfterHint: true,
      logger: {
        debug: (...debugArgs: unknown[]) => console.log("  [retry]", ...debugArgs),
        warn: (...warnArgs: unknown[]) => console.warn("  [retry]", ...warnArgs),
      },
    });

    const { metadata } = request;
    const status = metadata.status;
    const description = getStatusDescription(status);

    console.log(`  Status:      ${status}`);
    console.log(`  Description: ${description}`);
    console.log(`  Source:      ${metadata.sourceNetworkInfo.name}`);
    console.log(`  Destination: ${metadata.destNetworkInfo.name}`);

    if (metadata.receiptTransactionHash) {
      console.log(`  Dest tx:     ${metadata.receiptTransactionHash}`);
    }

    if (metadata.deliveryTime != null) {
      const seconds = Number(metadata.deliveryTime) / 1000;
      console.log(`  Delivery:    ${seconds.toFixed(1)}s`);
    }

    if (status === "SUCCESS") {
      console.log(`\n  Message delivered successfully!`);
    } else if (status === "FAILED") {
      console.error(`\n  Message execution failed on destination.`);
      console.log(`  Check CCIP Explorer for details.`);
    } else {
      console.log(`\n  Message still in progress. Check again later or view in explorer:`);
      console.log(`  ${getCCIPExplorerUrl("msg", messageId)}`);
    }

    if (metadata.readyForManualExecution) {
      console.log(`\n  This message is ready for manual execution.`);
    }
  } catch (error) {
    if (error instanceof CCIPMessageIdNotFoundError) {
      console.log("  Message not found.");
      console.log();
      console.log("  Possible reasons:");
      console.log("  - Message was sent recently and not yet indexed");
      console.log("  - Message ID is incorrect");
      console.log();
      console.log("  Try checking CCIP Explorer:");
      console.log(`  ${getCCIPExplorerUrl("msg", messageId)}`);
    } else if (CCIPError.isCCIPError(error)) {
      console.error(`  Error: ${error.message}`);
      if (error.recovery) {
        console.error(`  Recovery: ${error.recovery}`);
      }
      if (error.isTransient) {
        console.error("  Note: This error may be transient. Try again later.");
      }
    } else {
      console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

export default checkStatus;
