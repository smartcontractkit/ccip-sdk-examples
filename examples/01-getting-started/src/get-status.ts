/**
 * CCIP SDK Example: Get Message Status
 *
 * This script demonstrates how to check the status of a cross-chain message
 * using its message ID. It uses the CCIP API directly — status lookup is
 * a centralized operation that does not require a connection to any specific
 * chain.
 *
 * Message lifecycle depends on lane version:
 *
 * V1 Lanes (COMMITTING & EXECUTING DON):
 * 1. SENT - Transaction submitted on source chain
 * 2. SOURCE_FINALIZED - Source chain reached finality
 * 3. COMMITTED - DON committed merkle root to destination
 * 4. BLESSED - Risk Management Network approved
 * 5. SUCCESS or FAILED - Execution completed
 *
 * V2 Lanes (Verifier architecture):
 * 1. SENT - Transaction submitted on source chain
 * 2. SOURCE_FINALIZED - Source chain reached finality
 * 3. VERIFYING - Verification in progress
 * 4. VERIFIED - All required verifiers (Chainlink/external) have verified
 * 5. SUCCESS or FAILED - Execution completed
 *
 * Note: A message will NEVER have both COMMITTED/BLESSED and VERIFIED states.
 * The lifecycle depends on which lane version is deployed.
 *
 * Usage:
 *   pnpm status <your-message-id>
 */

import "dotenv/config";
import {
  CCIPAPIClient,
  getCCIPExplorerUrl,
  CCIPError,
  CCIPMessageIdNotFoundError,
  withRetry,
} from "@chainlink/ccip-sdk";
import { getStatusDescription, POLLING_CONFIG } from "@ccip-examples/shared-config";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: pnpm status <message-id>");
    console.log();
    console.log("  <message-id>  The 0x… message ID from transfer output");
    process.exit(1);
  }

  const messageId = args[0];

  if (!messageId) {
    console.error("Error: Message ID is required");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("CCIP SDK: Get Message Status");
  console.log("=".repeat(60));
  console.log();
  console.log(`Message ID: ${messageId}`);
  console.log();

  // The CCIP API is a centralized index — a single call can locate any
  // message regardless of which chain it was sent from.
  const apiClient = new CCIPAPIClient();

  try {
    console.log("Querying CCIP API (with retry for transient errors)...");
    console.log();

    // Use SDK's built-in retry logic for transient errors (e.g. indexing delay)
    const request = await withRetry(() => apiClient.getMessageById(messageId), {
      maxRetries: Math.min(POLLING_CONFIG.maxNotFoundRetries, 10), // Cap at 10 for CLI
      initialDelayMs: POLLING_CONFIG.initialDelay,
      maxDelayMs: POLLING_CONFIG.maxDelay,
      backoffMultiplier: 1.5,
      respectRetryAfterHint: true,
      logger: {
        debug: (...args: unknown[]) => console.log("  [retry]", ...args),
        warn: (...args: unknown[]) => console.warn("  [retry]", ...args),
      },
    });
    const { metadata } = request;

    const status = metadata.status;
    const description = getStatusDescription(status);

    console.log("Message Found!");
    console.log("-".repeat(60));
    console.log(`Status:      ${status}`);
    console.log(`Description: ${description}`);
    console.log(`Source:      ${metadata.sourceNetworkInfo.name}`);
    console.log(`Destination: ${metadata.destNetworkInfo.name}`);

    if (metadata.receiptTransactionHash) {
      console.log(`Dest TX:     ${metadata.receiptTransactionHash}`);
    }

    if (metadata.deliveryTime != null) {
      const seconds = Number(metadata.deliveryTime) / 1000;
      console.log(`Delivery:    ${seconds.toFixed(1)}s`);
    }

    if (metadata.readyForManualExecution) {
      console.log();
      console.log("⚠ This message is ready for manual execution.");
    }

    console.log();
    console.log("CCIP Explorer:");
    console.log(getCCIPExplorerUrl("msg", messageId));
  } catch (error) {
    if (error instanceof CCIPMessageIdNotFoundError) {
      console.log("Message not found.");
      console.log();
      console.log("Possible reasons:");
      console.log("- Message was sent recently and not yet indexed");
      console.log("- Message ID is incorrect");
      console.log();
      console.log("Try checking CCIP Explorer:");
      console.log(getCCIPExplorerUrl("msg", messageId));
    } else if (CCIPError.isCCIPError(error)) {
      console.error(`Error: ${error.message}`);
      if (error.recovery) {
        console.error(`Recovery: ${error.recovery}`);
      }
      if (error.isTransient) {
        console.error("Note: This error may be transient. Try again later.");
      }
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log();
  console.log("=".repeat(60));
}

main().catch(console.error);
