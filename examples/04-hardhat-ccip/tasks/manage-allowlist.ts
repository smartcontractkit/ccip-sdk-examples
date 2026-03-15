/**
 * Task: Manage allowlist on CCIPSender (peers) or CCIPReceiverExample (senders)
 *
 * Supports both single and batch operations:
 *
 *   # Sender: register a single peer
 *   npx hardhat --network ethereum-testnet-sepolia manage-allowlist \
 *     --contract 0x... --type sender --chains ethereum-testnet-sepolia-base-1 --peers 0x...
 *
 *   # Sender: batch register peers (comma-separated)
 *   npx hardhat --network ethereum-testnet-sepolia manage-allowlist \
 *     --contract 0x... --type sender \
 *     --chains ethereum-testnet-sepolia-base-1,ethereum-testnet-sepolia-arbitrum-1 \
 *     --peers 0xReceiverBase,0xReceiverArb
 *
 *   # Receiver: allowlist a single sender
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 manage-allowlist \
 *     --contract 0x... --type receiver --chains ethereum-testnet-sepolia --senders 0x...
 *
 *   # Receiver: batch allowlist (comma-separated)
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 manage-allowlist \
 *     --contract 0x... --type receiver \
 *     --chains ethereum-testnet-sepolia,ethereum-testnet-sepolia-arbitrum-1 \
 *     --senders 0xSenderSepolia,0xSenderArb
 *
 *   # Remove with --remove flag
 *   npx hardhat --network ethereum-testnet-sepolia manage-allowlist \
 *     --contract 0x... --type sender --chains ethereum-testnet-sepolia-base-1 --peers 0x... --remove true
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { networkInfo } from "@chainlink/ccip-sdk";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { createClients } from "../helpers/sdk.js";

interface ManageAllowlistArgs {
  contract: string;
  type: string;
  chains: string;
  peers: string;
  senders: string;
  remove: string;
}

const manageAllowlist = async (
  args: ManageAllowlistArgs,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const connection = await hre.network.connect();
  const networkId = connection.networkName;

  if (!args.contract) throw new Error("--contract is required");
  if (!args.type || (args.type !== "sender" && args.type !== "receiver")) {
    throw new Error("--type must be 'sender' or 'receiver'");
  }
  if (!args.chains) throw new Error("--chains is required");

  const chainIds = args.chains
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (chainIds.length === 0) throw new Error("--chains must contain at least one chain ID");
  const isRemove = args.remove === "true";

  // Validate all chain IDs upfront
  for (const id of chainIds) {
    try {
      networkInfo(id);
    } catch {
      throw new Error(`Unknown chain: "${id}". Use a valid CCIP network ID.`);
    }
  }

  const { publicClient, walletClient } = createClients(networkId);

  if (args.type === "sender") {
    await handleSender(args, chainIds, isRemove, hre, publicClient, walletClient, networkId);
  } else {
    await handleReceiver(args, chainIds, isRemove, hre, publicClient, walletClient, networkId);
  }
};

async function handleSender(
  args: ManageAllowlistArgs,
  chainIds: string[],
  isRemove: boolean,
  hre: HardhatRuntimeEnvironment,
  publicClient: ReturnType<typeof createClients>["publicClient"],
  walletClient: ReturnType<typeof createClients>["walletClient"],
  networkId: string
): Promise<void> {
  const peerAddresses = args.peers ? args.peers.split(",").map((p) => p.trim()) : [];
  if (peerAddresses.length === 0) throw new Error("--peers is required for sender type");
  if (chainIds.length !== peerAddresses.length) {
    throw new Error(
      `--chains count (${chainIds.length}) must match --peers count (${peerAddresses.length})`
    );
  }

  const artifact = await hre.artifacts.readArtifact("CCIPSender");
  const selectors = chainIds.map((id) => networkInfo(id).chainSelector);
  const peers = isRemove
    ? peerAddresses.map(() => "0x0000000000000000000000000000000000000000" as `0x${string}`)
    : peerAddresses.map((p) => p as `0x${string}`);

  const action = isRemove ? "Removing" : "Registering";
  console.log(`\n${action} ${chainIds.length} peer(s) on CCIPSender...`);
  console.log(`  Network: ${networkId}`);
  console.log(`  Contract: ${args.contract}`);

  for (let i = 0; i < chainIds.length; i++) {
    console.log(`  [${i + 1}] ${chainIds[i]} (selector: ${selectors[i]}) → ${peers[i]}`);
  }

  let hash: `0x${string}`;

  if (chainIds.length === 1) {
    hash = await walletClient.writeContract({
      address: args.contract as `0x${string}`,
      abi: artifact.abi,
      functionName: "setPeer",
      args: [selectors[0], peers[0]],
    });
  } else {
    hash = await walletClient.writeContract({
      address: args.contract as `0x${string}`,
      abi: artifact.abi,
      functionName: "setPeers",
      args: [selectors, peers],
    });
  }

  console.log(`  Tx hash: ${hash}`);
  console.log(`  Explorer: ${getExplorerTxUrl(networkId, hash)}`);

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(
    `\n  ${chainIds.length} peer(s) ${isRemove ? "removed" : "registered"} successfully.`
  );
}

async function handleReceiver(
  args: ManageAllowlistArgs,
  chainIds: string[],
  isRemove: boolean,
  hre: HardhatRuntimeEnvironment,
  publicClient: ReturnType<typeof createClients>["publicClient"],
  walletClient: ReturnType<typeof createClients>["walletClient"],
  networkId: string
): Promise<void> {
  const senderAddresses = args.senders ? args.senders.split(",").map((s) => s.trim()) : [];
  if (senderAddresses.length === 0) throw new Error("--senders is required for receiver type");
  if (chainIds.length !== senderAddresses.length) {
    throw new Error(
      `--chains count (${chainIds.length}) must match --senders count (${senderAddresses.length})`
    );
  }

  const artifact = await hre.artifacts.readArtifact("CCIPReceiverExample");
  const allowed = !isRemove;
  const action = isRemove ? "Removing" : "Allowlisting";

  console.log(`\n${action} ${chainIds.length} sender(s) on CCIPReceiverExample...`);
  console.log(`  Network: ${networkId}`);
  console.log(`  Contract: ${args.contract}`);

  const selectors = chainIds.map((id) => networkInfo(id).chainSelector);

  for (let i = 0; i < chainIds.length; i++) {
    console.log(
      `  [${i + 1}] ${chainIds[i]} (selector: ${selectors[i]}) → ${senderAddresses[i]} (allowed: ${allowed})`
    );
  }

  let hash: `0x${string}`;

  if (chainIds.length === 1) {
    hash = await walletClient.writeContract({
      address: args.contract as `0x${string}`,
      abi: artifact.abi,
      functionName: "allowlistSender",
      args: [selectors[0], senderAddresses[0] as `0x${string}`, allowed],
    });
  } else {
    const entries = chainIds.map((_, i) => ({
      sourceChainSelector: selectors[i],
      sender: senderAddresses[i] as `0x${string}`,
      allowed,
    }));

    hash = await walletClient.writeContract({
      address: args.contract as `0x${string}`,
      abi: artifact.abi,
      functionName: "updateAllowlist",
      args: [entries],
    });
  }

  console.log(`  Tx hash: ${hash}`);
  console.log(`  Explorer: ${getExplorerTxUrl(networkId, hash)}`);

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(
    `\n  ${chainIds.length} sender(s) ${isRemove ? "removed" : "allowlisted"} successfully.`
  );
}

export default manageAllowlist;
