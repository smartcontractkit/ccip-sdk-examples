/**
 * Task: Check the receiver contract's cross-chain inbox
 *
 * Reads stored data-only messages from the CCIPReceiverExample contract.
 * Each message includes source chain, sender, data payload, and timestamp.
 *
 * Usage:
 *   # Show last 5 messages (default)
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 check-inbox \
 *     --receiver-contract 0x...
 *
 *   # Show last 10 messages
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 check-inbox \
 *     --receiver-contract 0x... --count 10
 *
 *   # Look up a specific message by ID
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 check-inbox \
 *     --receiver-contract 0x... --message-id 0x...
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { hexToString } from "viem";
import { getCCIPExplorerUrl } from "@chainlink/ccip-sdk";
import { createClients } from "../helpers/sdk.js";

interface CheckInboxArgs {
  receiverContract: string;
  count: string;
  messageId: string;
}

// Minimal ABI for inbox read functions
const inboxAbi = [
  {
    name: "getInboxLength",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getLatestMessages",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "messageId", type: "bytes32" },
          { name: "sourceChainSelector", type: "uint64" },
          { name: "sender", type: "address" },
          { name: "data", type: "bytes" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "messageIndex",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "messageId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "getInboxMessage",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "messageId", type: "bytes32" },
          { name: "sourceChainSelector", type: "uint64" },
          { name: "sender", type: "address" },
          { name: "data", type: "bytes" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
  },
] as const;

interface InboxMessage {
  messageId: `0x${string}`;
  sourceChainSelector: bigint;
  sender: `0x${string}`;
  data: `0x${string}`;
  timestamp: bigint;
}

const checkInbox = async (args: CheckInboxArgs, hre: HardhatRuntimeEnvironment): Promise<void> => {
  const connection = await hre.network.connect();
  const networkId = connection.networkName;
  const { publicClient } = createClients(networkId);
  const contractAddress = args.receiverContract as `0x${string}`;

  // Get inbox length
  const inboxLength = await publicClient.readContract({
    address: contractAddress,
    abi: inboxAbi,
    functionName: "getInboxLength",
  });

  console.log(`\nCCIP Receiver Inbox on ${networkId}`);
  console.log(`  Contract: ${contractAddress}`);
  console.log(`  Total messages: ${inboxLength}`);

  if (inboxLength === 0n) {
    console.log(`\n  Inbox is empty. No data-only messages received yet.`);
    return;
  }

  // Look up a specific message by ID
  if (args.messageId !== "") {
    // messageIndex stores index + 1, so 0 means "not found"
    const indexPlusOne = await publicClient.readContract({
      address: contractAddress,
      abi: inboxAbi,
      functionName: "messageIndex",
      args: [args.messageId as `0x${string}`],
    });

    if (indexPlusOne === 0n) {
      console.log(`\n  Message ID not found in inbox.`);
      return;
    }

    const index = indexPlusOne - 1n;
    const msg = (await publicClient.readContract({
      address: contractAddress,
      abi: inboxAbi,
      functionName: "getInboxMessage",
      args: [index],
    })) as InboxMessage;

    console.log(`\n  Message found at index ${index}:`);
    printMessage(msg);
    return;
  }

  // Show latest N messages
  const parsedCount = parseInt(args.count, 10);
  if (isNaN(parsedCount) || parsedCount <= 0) {
    throw new Error(`Invalid --count: "${args.count}". Must be a positive number.`);
  }
  const count = BigInt(parsedCount);
  const messages = (await publicClient.readContract({
    address: contractAddress,
    abi: inboxAbi,
    functionName: "getLatestMessages",
    args: [count],
  })) as readonly InboxMessage[];

  console.log(`\n  Showing latest ${messages.length} message(s):\n`);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    console.log(`  --- Message ${i + 1} ---`);
    printMessage(msg);
    console.log();
  }
};

function printMessage(msg: InboxMessage): void {
  const date = new Date(Number(msg.timestamp) * 1000);

  console.log(`    Message ID:   ${msg.messageId}`);
  console.log(`    Source chain:  ${msg.sourceChainSelector}`);
  console.log(`    Sender:       ${msg.sender}`);
  console.log(`    Data:         ${msg.data}`);

  // Try to decode as UTF-8 string (data-only messages use encodePacked string)
  try {
    const text = hexToString(msg.data);
    if (text.length > 0 && /^[\x20-\x7E]+$/.test(text)) {
      console.log(`    Data (text):  "${text}"`);
    }
  } catch {
    // Not decodable as text — that's fine, it might be ABI-encoded (e.g., PTT address)
  }

  console.log(`    Received:     ${date.toISOString()}`);
  console.log(`    CCIP Explorer: ${getCCIPExplorerUrl("msg", msg.messageId)}`);
}

export default checkInbox;
