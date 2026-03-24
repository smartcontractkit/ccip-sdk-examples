/**
 * Task: Query contract configuration (peers, allowlist, failed messages)
 *
 * Usage:
 *   # Check if a peer is registered on sender
 *   npx hardhat --network avalanche-testnet-fuji query-config \
 *     --contract 0x... --type sender --query peer \
 *     --chain ethereum-testnet-sepolia
 *
 *   # Check if a sender is allowlisted on receiver
 *   npx hardhat --network ethereum-testnet-sepolia query-config \
 *     --contract 0x... --type receiver --query allowlist \
 *     --chain avalanche-testnet-fuji --address 0x...
 *
 *   # Check if a message failed on receiver
 *   npx hardhat --network ethereum-testnet-sepolia query-config \
 *     --contract 0x... --type receiver --query failed \
 *     --message-id 0x...
 *
 *   # Check contract pause status
 *   npx hardhat --network ethereum-testnet-sepolia query-config \
 *     --contract 0x... --type receiver --query status
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { networkInfo } from "@chainlink/ccip-sdk";
import { createClients } from "../helpers/sdk.js";

interface QueryConfigArgs {
  contract: string;
  type: string;
  query: string;
  chain: string;
  address: string;
  messageId: string;
}

const queryConfig = async (
  args: QueryConfigArgs,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const connection = await hre.network.connect();
  const networkId = connection.networkName;

  if (!args.contract) throw new Error("--contract is required");
  if (args.type !== "sender" && args.type !== "receiver") {
    throw new Error(`Invalid --type: "${args.type}". Must be "sender" or "receiver".`);
  }

  const validQueries = ["peer", "allowlist", "failed", "status"];
  if (!validQueries.includes(args.query)) {
    throw new Error(`Invalid --query: "${args.query}". Must be one of: ${validQueries.join(", ")}`);
  }

  const artifactName = args.type === "sender" ? "CCIPSender" : "CCIPReceiverExample";
  const artifact = await hre.artifacts.readArtifact(artifactName);
  const { publicClient } = createClients(networkId);
  const contractAddress = args.contract as `0x${string}`;

  console.log(`\nQuerying ${artifactName} on ${networkId}`);
  console.log(`  Contract: ${contractAddress}`);

  if (args.query === "status") {
    const isPaused = (await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "paused",
    })) as boolean;
    const owner = (await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "owner",
    })) as string;
    console.log(`  Owner:  ${owner}`);
    console.log(`  Paused: ${String(isPaused)}`);
    return;
  }

  if (args.query === "peer") {
    if (args.type !== "sender") {
      throw new Error("--query peer is only valid for --type sender");
    }
    if (!args.chain) throw new Error("--chain is required for peer query");

    let chainSelector: bigint;
    try {
      chainSelector = networkInfo(args.chain).chainSelector;
    } catch {
      throw new Error(`Unknown chain: "${args.chain}". Use a valid CCIP network ID.`);
    }

    const peerAddress = (await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "peers",
      args: [chainSelector],
    })) as string;

    const isRegistered = peerAddress !== "0x0000000000000000000000000000000000000000";
    console.log(`  Chain:      ${args.chain} (selector: ${chainSelector})`);
    console.log(`  Peer:       ${peerAddress}`);
    console.log(`  Registered: ${String(isRegistered)}`);
    return;
  }

  if (args.query === "allowlist") {
    if (args.type !== "receiver") {
      throw new Error("--query allowlist is only valid for --type receiver");
    }
    if (!args.chain) throw new Error("--chain is required for allowlist query");
    if (!args.address) throw new Error("--address is required for allowlist query");

    let chainSelector: bigint;
    try {
      chainSelector = networkInfo(args.chain).chainSelector;
    } catch {
      throw new Error(`Unknown chain: "${args.chain}". Use a valid CCIP network ID.`);
    }

    const isAllowed = (await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "allowlistedSenders",
      args: [chainSelector, args.address as `0x${string}`],
    })) as boolean;

    console.log(`  Chain:     ${args.chain} (selector: ${chainSelector})`);
    console.log(`  Sender:    ${args.address}`);
    console.log(`  Allowed:   ${String(isAllowed)}`);
    return;
  }

  if (args.query === "failed") {
    if (args.type !== "receiver") {
      throw new Error("--query failed is only valid for --type receiver");
    }
    if (!args.messageId) throw new Error("--message-id is required for failed query");

    const isFailed = (await publicClient.readContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "failedMessages",
      args: [args.messageId as `0x${string}`],
    })) as boolean;

    console.log(`  Message ID: ${args.messageId}`);
    console.log(`  Failed:     ${String(isFailed)}`);
    return;
  }
};

export default queryConfig;
