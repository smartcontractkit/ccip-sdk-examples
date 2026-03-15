/**
 * Task: Deploy CCIPReceiverExample contract
 *
 * Usage:
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 deploy-receiver
 *   npx hardhat --network ethereum-testnet-sepolia-base-1 deploy-receiver \
 *     --allowlist-chain ethereum-testnet-sepolia \
 *     --allowlist-sender 0x1234...
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { networkInfo } from "@chainlink/ccip-sdk";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { createClients, getRouterAddress } from "../helpers/sdk.js";

interface DeployReceiverArgs {
  allowlistChain: string;
  allowlistSender: string;
}

const deployReceiver = async (
  args: DeployReceiverArgs,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const connection = await hre.network.connect();
  const networkId = connection.networkName;
  const routerAddress = getRouterAddress(networkId);

  console.log(`\nDeploying CCIPReceiverExample on ${networkId}...`);
  console.log(`  Router: ${routerAddress}`);

  const { publicClient, walletClient } = createClients(networkId);
  const artifact = await hre.artifacts.readArtifact("CCIPReceiverExample");

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [routerAddress as `0x${string}`],
  });

  console.log(`  Tx hash: ${hash}`);
  console.log(`  Explorer: ${getExplorerTxUrl(networkId, hash)}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error("Deployment failed: no contract address in receipt");
  }

  const receiverAddress = receipt.contractAddress;
  console.log(`\n  CCIPReceiverExample deployed at: ${receiverAddress}`);

  // Optionally allowlist a sender on a specific source chain
  if (args.allowlistChain !== "" && args.allowlistSender !== "") {
    const sourceChainSelector = networkInfo(args.allowlistChain).chainSelector;
    console.log(
      `\n  Allowlisting sender ${args.allowlistSender} on source chain ${args.allowlistChain} (selector: ${sourceChainSelector})`
    );

    const allowlistHash = await walletClient.writeContract({
      address: receiverAddress,
      abi: artifact.abi,
      functionName: "allowlistSender",
      args: [sourceChainSelector, args.allowlistSender as `0x${string}`, true],
    });
    await publicClient.waitForTransactionReceipt({ hash: allowlistHash });
    console.log(`  Sender allowlisted on source chain.`);
  }

  console.log(`\nSave this address for use as --receiver in send tasks.`);
};

export default deployReceiver;
