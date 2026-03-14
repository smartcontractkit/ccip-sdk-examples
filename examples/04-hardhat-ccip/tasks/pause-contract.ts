/**
 * Task: Pause or unpause a CCIPSender or CCIPReceiverExample contract
 *
 * When paused:
 *   - CCIPSender: send() reverts (no new messages can be sent)
 *   - CCIPReceiverExample: _ccipReceive reverts — CCIP marks the message
 *     as failed and it can be manually re-executed later once unpaused
 *
 * Usage:
 *   # Pause sender contract
 *   npx hardhat --network avalanche-testnet-fuji pause-contract \
 *     --contract 0x... --type sender --action pause
 *
 *   # Unpause receiver contract
 *   npx hardhat --network ethereum-testnet-sepolia pause-contract \
 *     --contract 0x... --type receiver --action unpause
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { createClients } from "../helpers/sdk.js";

interface PauseContractArgs {
  contract: string;
  type: string;
  action: string;
}

const pauseContract = async (
  args: PauseContractArgs,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const connection = await hre.network.connect();
  const networkId = connection.networkName;

  if (!args.contract) throw new Error("--contract is required");
  if (args.type !== "sender" && args.type !== "receiver") {
    throw new Error(`Invalid --type: "${args.type}". Must be "sender" or "receiver".`);
  }
  if (args.action !== "pause" && args.action !== "unpause") {
    throw new Error(`Invalid --action: "${args.action}". Must be "pause" or "unpause".`);
  }

  const artifactName = args.type === "sender" ? "CCIPSender" : "CCIPReceiverExample";
  const artifact = await hre.artifacts.readArtifact(artifactName);
  const { publicClient, walletClient } = createClients(networkId);

  // Check current pause state
  const isPaused = await publicClient.readContract({
    address: args.contract as `0x${string}`,
    abi: artifact.abi,
    functionName: "paused",
  });

  if (args.action === "pause" && isPaused) {
    console.log(`\n  Contract is already paused. Nothing to do.`);
    return;
  }
  if (args.action === "unpause" && !isPaused) {
    console.log(`\n  Contract is already unpaused. Nothing to do.`);
    return;
  }

  console.log(`\n${args.action === "pause" ? "Pausing" : "Unpausing"} ${artifactName}...`);
  console.log(`  Network:  ${networkId}`);
  console.log(`  Contract: ${args.contract}`);

  const hash = await walletClient.writeContract({
    address: args.contract as `0x${string}`,
    abi: artifact.abi,
    functionName: args.action,
  });

  console.log(`  Tx hash:  ${hash}`);
  console.log(`  Explorer: ${getExplorerTxUrl(networkId, hash)}`);

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`\n  Contract ${args.action === "pause" ? "paused" : "unpaused"} successfully.`);
};

export default pauseContract;
