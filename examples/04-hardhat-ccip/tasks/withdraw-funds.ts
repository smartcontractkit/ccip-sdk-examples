/**
 * Task: Withdraw native currency or ERC20 tokens from a contract
 *
 * Use this to recover:
 *   - Native currency sent to the contract
 *   - ERC20 tokens from failed CCIP messages (tokens stay in the receiver contract)
 *   - Any stuck tokens
 *
 * Usage:
 *   # Withdraw native currency from sender contract
 *   npx hardhat --network avalanche-testnet-fuji withdraw-funds \
 *     --contract 0x... --type sender --beneficiary 0x...
 *
 *   # Withdraw ERC20 tokens from receiver contract (full balance)
 *   npx hardhat --network ethereum-testnet-sepolia withdraw-funds \
 *     --contract 0x... --type receiver --beneficiary 0x... --token 0x...
 *
 *   # Withdraw specific amount of ERC20 tokens
 *   npx hardhat --network ethereum-testnet-sepolia withdraw-funds \
 *     --contract 0x... --type receiver --beneficiary 0x... --token 0x... --amount 1000000
 */

import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { erc20Abi, formatUnits } from "viem";
import { getExplorerTxUrl } from "@ccip-examples/shared-config";
import { createClients } from "../helpers/sdk.js";

interface WithdrawFundsArgs {
  contract: string;
  type: string;
  beneficiary: string;
  token: string;
  amount: string;
}

const withdrawFunds = async (
  args: WithdrawFundsArgs,
  hre: HardhatRuntimeEnvironment
): Promise<void> => {
  const connection = await hre.network.connect();
  const networkId = connection.networkName;

  if (!args.contract) throw new Error("--contract is required");
  if (!args.beneficiary) throw new Error("--beneficiary is required");
  if (args.type !== "sender" && args.type !== "receiver") {
    throw new Error(`Invalid --type: "${args.type}". Must be "sender" or "receiver".`);
  }

  const artifactName = args.type === "sender" ? "CCIPSender" : "CCIPReceiverExample";
  const artifact = await hre.artifacts.readArtifact(artifactName);
  const { publicClient, walletClient } = createClients(networkId);
  const contractAddress = args.contract as `0x${string}`;
  const beneficiary = args.beneficiary as `0x${string}`;

  if (args.token !== "") {
    // ERC20 withdrawal
    const tokenAddress = args.token as `0x${string}`;

    const [symbol, decimals, balance] = await Promise.all([
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [contractAddress],
      }),
    ]);

    if (balance === 0n) {
      console.log(`\n  No ${symbol} tokens in contract. Nothing to withdraw.`);
      return;
    }

    const withdrawAmount = args.amount !== "0" ? BigInt(args.amount) : 0n;
    const displayAmount =
      withdrawAmount === 0n
        ? `${formatUnits(balance, decimals)} ${symbol} (full balance)`
        : `${formatUnits(withdrawAmount, decimals)} ${symbol}`;

    console.log(`\nWithdrawing ERC20 tokens from ${artifactName}...`);
    console.log(`  Network:     ${networkId}`);
    console.log(`  Contract:    ${contractAddress}`);
    console.log(`  Token:       ${symbol} (${tokenAddress})`);
    console.log(`  Balance:     ${formatUnits(balance, decimals)} ${symbol}`);
    console.log(`  Withdrawing: ${displayAmount}`);
    console.log(`  Beneficiary: ${beneficiary}`);

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "withdrawToken",
      args: [beneficiary, tokenAddress, withdrawAmount],
    });

    console.log(`  Tx hash:     ${hash}`);
    console.log(`  Explorer:    ${getExplorerTxUrl(networkId, hash)}`);

    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`\n  Tokens withdrawn successfully.`);
  } else {
    // Native currency withdrawal
    const balance = await publicClient.getBalance({ address: contractAddress });

    if (balance === 0n) {
      console.log(`\n  No native currency in contract. Nothing to withdraw.`);
      return;
    }

    console.log(`\nWithdrawing native currency from ${artifactName}...`);
    console.log(`  Network:     ${networkId}`);
    console.log(`  Contract:    ${contractAddress}`);
    console.log(`  Balance:     ${formatUnits(balance, 18)} ETH/AVAX`);
    console.log(`  Beneficiary: ${beneficiary}`);

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: artifact.abi,
      functionName: "withdraw",
      args: [beneficiary],
    });

    console.log(`  Tx hash:     ${hash}`);
    console.log(`  Explorer:    ${getExplorerTxUrl(networkId, hash)}`);

    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`\n  Native currency withdrawn successfully.`);
  }
};

export default withdrawFunds;
