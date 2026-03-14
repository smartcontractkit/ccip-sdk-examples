/**
 * Task: List CCIP messages using the SDK's searchAllMessages() async generator
 *
 * Streams messages across all pages automatically — no manual cursor handling.
 * Collects up to --limit results and displays them.
 *
 * Usage:
 *   # List recent messages (default: 10)
 *   npx hardhat list-messages
 *
 *   # Filter by sender
 *   npx hardhat list-messages --sender 0x...
 *
 *   # Filter by source and destination chain
 *   npx hardhat list-messages \
 *     --source-chain ethereum-testnet-sepolia \
 *     --dest-chain ethereum-testnet-sepolia-base-1
 *
 *   # Filter by source tx hash
 *   npx hardhat list-messages --tx-hash 0x...
 *
 *   # Show only messages ready for manual execution
 *   npx hardhat list-messages --ready-for-exec true
 *
 *   # Fetch more results
 *   npx hardhat list-messages --limit 25
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import {
  type MessageSearchFilters,
  CCIPAPIClient,
  getCCIPExplorerUrl,
  networkInfo,
} from "@chainlink/ccip-sdk";
import { formatRelativeTime } from "@ccip-examples/shared-utils";

interface ListMessagesArgs {
  sender: string;
  receiver: string;
  sourceChain: string;
  destChain: string;
  txHash: string;
  readyForExec: string;
  limit: string;
}

const listMessages = async (
  args: ListMessagesArgs,
  _hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const limit = parseInt(args.limit, 10);
  if (isNaN(limit) || limit <= 0) {
    throw new Error(`Invalid --limit: "${args.limit}". Must be a positive number.`);
  }

  // Build filters from flags
  const filters: MessageSearchFilters = {};
  if (args.sender !== "") filters.sender = args.sender;
  if (args.receiver !== "") filters.receiver = args.receiver;
  if (args.sourceChain !== "") {
    try {
      filters.sourceChainSelector = networkInfo(args.sourceChain).chainSelector;
    } catch {
      throw new Error(`Unknown source chain: "${args.sourceChain}". Use a valid CCIP network ID.`);
    }
  }
  if (args.destChain !== "") {
    try {
      filters.destChainSelector = networkInfo(args.destChain).chainSelector;
    } catch {
      throw new Error(
        `Unknown destination chain: "${args.destChain}". Use a valid CCIP network ID.`
      );
    }
  }
  if (args.txHash !== "") filters.sourceTransactionHash = args.txHash;
  if (args.readyForExec !== "" && args.readyForExec !== "true" && args.readyForExec !== "false") {
    throw new Error(`Invalid --ready-for-exec: "${args.readyForExec}". Must be "true" or "false".`);
  }
  if (args.readyForExec === "true") filters.readyForManualExecOnly = true;

  // Display active filters
  const activeFilters = Object.entries(filters);
  console.log(`\nCCIP Message Search`);
  if (activeFilters.length > 0) {
    console.log(`  Filters:`);
    for (const [key, value] of activeFilters) {
      console.log(`    ${key}: ${value}`);
    }
  } else {
    console.log(`  Filters: none (showing recent messages)`);
  }
  console.log(`  Limit: ${limit}`);

  const apiClient = new CCIPAPIClient();

  // Stream messages using the async generator — handles pagination automatically
  interface SearchResult {
    messageId: string;
    status: string;
    origin: string;
    sender: string;
    receiver: string;
    sourceNetworkInfo: { name: string };
    destNetworkInfo: { name: string };
    sendTransactionHash: string;
    sendTimestamp: string;
  }
  const results: SearchResult[] = [];

  console.log(`\n  Fetching messages...\n`);

  for await (const msg of apiClient.searchAllMessages(filters)) {
    results.push(msg);
    if (results.length >= limit) break;
  }

  if (results.length === 0) {
    console.log(`  No messages found matching the filters.`);
    return;
  }

  console.log(`  Showing ${results.length} message(s):\n`);

  for (let i = 0; i < results.length; i++) {
    const msg = results[i];
    if (!msg) continue;
    const statusIcon = getStatusIcon(msg.status);

    console.log(`  ${i + 1}. ${statusIcon} ${msg.messageId}`);
    console.log(`     Status:  ${msg.status}`);
    console.log(`     Route:   ${msg.sourceNetworkInfo.name} → ${msg.destNetworkInfo.name}`);
    if (msg.sender) console.log(`     Sender:  ${msg.sender}`);
    if (msg.receiver) console.log(`     Receiver: ${msg.receiver}`);
    if (msg.sendTimestamp) {
      console.log(`     Sent:    ${formatRelativeTime(new Date(msg.sendTimestamp).getTime())}`);
    }
    console.log(`     Explorer: ${getCCIPExplorerUrl("msg", msg.messageId)}`);
    console.log();
  }

  console.log(`  --- End of results ---`);
};

function getStatusIcon(status: string): string {
  switch (status) {
    case "SUCCESS":
      return "[OK]";
    case "FAILED":
      return "[FAIL]";
    case "SENT":
    case "SOURCE_FINALIZED":
    case "COMMITTED":
    case "BLESSED":
    case "VERIFYING":
    case "VERIFIED":
      return "[..]";
    default:
      return "[??]";
  }
}

export default listMessages;
