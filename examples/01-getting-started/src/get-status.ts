/**
 * CCIP SDK Example: Get Message Status (EVM + Solana)
 *
 * This script demonstrates how to check the status of a cross-chain message
 * using its message ID. Searches across both EVM and Solana networks.
 *
 * Message lifecycle states:
 * - SENT: Transaction submitted on source chain
 * - SOURCE_FINALIZED: Source chain reached finality
 * - COMMITTED: DON committed merkle root to destination
 * - BLESSED: Risk Management Network approved
 * - VERIFIED: Message verified on destination
 * - SUCCESS: Message executed successfully
 * - FAILED: Message execution failed
 *
 * Usage:
 *   pnpm status <message_id>
 *   pnpm status 0x1234...
 */

import { EVMChain, SolanaChain, getCCIPExplorerUrl, CCIPError } from "@chainlink/ccip-sdk";
import {
  getEVMNetworks,
  getSolanaNetworks,
  getStatusDescription,
} from "@ccip-examples/shared-config";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: pnpm status <message_id>");
    console.log();
    console.log("Example:");
    console.log("  pnpm status 0x1234567890abcdef...");
    process.exit(1);
  }

  const messageId = args[0];

  if (!messageId) {
    console.error("Error: Message ID is required");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("CCIP SDK: Get Message Status (EVM + Solana)");
  console.log("=".repeat(60));
  console.log();
  console.log(`Message ID: ${messageId}`);
  console.log();
  console.log("Searching for message across networks...");
  console.log();

  let found = false;

  // Search EVM networks
  const evmNetworks = getEVMNetworks();
  for (const [networkKey, config] of evmNetworks) {
    try {
      const chain = await EVMChain.fromUrl(config.rpcUrl);
      const message = await chain.getMessageById(messageId);

      found = true;
      const metadata = message.metadata;
      const status = metadata?.status ?? "UNKNOWN";
      const description = getStatusDescription(status);

      console.log("Message Found on EVM!");
      console.log("-".repeat(60));
      console.log(`Network:     ${config.name} (${networkKey})`);
      console.log(`Status:      ${status}`);
      console.log(`Description: ${description}`);

      if (metadata) {
        console.log(`Source:      ${metadata.sourceNetworkInfo.name}`);
        console.log(`Destination: ${metadata.destNetworkInfo.name}`);
        if (metadata.receiptTransactionHash) {
          console.log(`Dest TX:     ${metadata.receiptTransactionHash}`);
        }
      }

      console.log();
      console.log("CCIP Explorer:");
      console.log(getCCIPExplorerUrl("msg", messageId));
      break;
    } catch (error) {
      // Expected: MESSAGE_ID_NOT_FOUND means message not on this network
      // Log unexpected errors for debugging
      if (!CCIPError.isCCIPError(error) || error.code !== "MESSAGE_ID_NOT_FOUND") {
        console.debug(
          `  ${config.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  // Search Solana networks if not found
  if (!found) {
    const solanaNetworks = getSolanaNetworks();
    for (const [networkKey, config] of solanaNetworks) {
      try {
        const chain = await SolanaChain.fromUrl(config.rpcUrl);
        const message = await chain.getMessageById(messageId);

        found = true;
        const metadata = message.metadata;
        const status = metadata?.status ?? "UNKNOWN";
        const description = getStatusDescription(status);

        console.log("Message Found on Solana!");
        console.log("-".repeat(60));
        console.log(`Network:     ${config.name} (${networkKey})`);
        console.log(`Status:      ${status}`);
        console.log(`Description: ${description}`);

        if (metadata) {
          console.log(`Source:      ${metadata.sourceNetworkInfo.name}`);
          console.log(`Destination: ${metadata.destNetworkInfo.name}`);
          if (metadata.receiptTransactionHash) {
            console.log(`Dest TX:     ${metadata.receiptTransactionHash}`);
          }
        }

        console.log();
        console.log("CCIP Explorer:");
        console.log(getCCIPExplorerUrl("msg", messageId));
        break;
      } catch (error) {
        // Expected: MESSAGE_ID_NOT_FOUND means message not on this network
        // Log unexpected errors for debugging
        if (!CCIPError.isCCIPError(error) || error.code !== "MESSAGE_ID_NOT_FOUND") {
          console.debug(
            `  ${config.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  if (!found) {
    console.log("Message not found on any network.");
    console.log();
    console.log("Possible reasons:");
    console.log("- Message was sent recently and not yet indexed");
    console.log("- Message ID is incorrect");
    console.log("- Message was sent on a network not in our config");
    console.log();
    console.log("Try checking CCIP Explorer:");
    console.log(getCCIPExplorerUrl("msg", messageId));
  }

  console.log();
  console.log("=".repeat(60));
}

main().catch(console.error);
