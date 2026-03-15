/**
 * Task: Deploy CCIPSender contract
 *
 * Usage:
 *   npx hardhat --network ethereum-testnet-sepolia deploy-sender
 *   npx hardhat --network ethereum-testnet-sepolia deploy-sender \
 *     --peer-chain ethereum-testnet-sepolia-base-1 \
 *     --peer-address 0x1234...
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { networkInfo } from "@chainlink/ccip-sdk";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { createClients, getRouterAddress } from "../helpers/sdk.js";

interface DeploySenderArgs {
  peerChain: string;
  peerAddress: string;
}

const deploySender = async (
  args: DeploySenderArgs,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const connection = await hre.network.connect();
  const networkId = connection.networkName;
  const routerAddress = getRouterAddress(networkId);

  console.log(`\nDeploying CCIPSender on ${networkId}...`);
  console.log(`  Router: ${routerAddress}`);

  const { publicClient, walletClient } = createClients(networkId);
  const artifact = await hre.artifacts.readArtifact("CCIPSender");

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

  const senderAddress = receipt.contractAddress;
  console.log(`\n  CCIPSender deployed at: ${senderAddress}`);

  // Optionally register a peer (trusted destination chain + receiver)
  if (args.peerChain !== "" && args.peerAddress !== "") {
    const destChainSelector = networkInfo(args.peerChain).chainSelector;
    console.log(
      `\n  Registering peer ${args.peerAddress} on dest chain ${args.peerChain} (selector: ${destChainSelector})`
    );

    const setPeerHash = await walletClient.writeContract({
      address: senderAddress,
      abi: artifact.abi,
      functionName: "setPeer",
      args: [destChainSelector, args.peerAddress as `0x${string}`],
    });
    await publicClient.waitForTransactionReceipt({ hash: setPeerHash });
    console.log(`  Peer registered.`);
  }

  console.log(`\nSave this address for use with send-via-sender task.`);
};

export default deploySender;
