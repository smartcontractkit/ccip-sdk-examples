/**
 * CCIP SDK Example: List Supported Chains
 *
 * Lists all supported chain keys with their friendly names.
 * Use these keys with other commands like transfer, fees, etc.
 *
 * Usage:
 *   pnpm chains
 */

import { getAllNetworks } from "@ccip-examples/shared-config";
import { ChainFamily } from "@chainlink/ccip-sdk";

function main() {
  console.log("=".repeat(60));
  console.log("CCIP SDK: Supported Chains");
  console.log("=".repeat(60));
  console.log();

  const networks = getAllNetworks();

  // Group by chain family (using SDK's ChainFamily enum)
  const evmNetworks = networks.filter((n) => n.family === ChainFamily.EVM);
  const svmNetworks = networks.filter((n) => n.family === ChainFamily.Solana);

  console.log("EVM Networks:");
  console.log("-".repeat(60));
  console.log("Key".padEnd(40) + "Name");
  console.log("-".repeat(60));
  for (const network of evmNetworks) {
    console.log(`${network.key.padEnd(40)}${network.name}`);
  }

  console.log();
  console.log("Solana Networks:");
  console.log("-".repeat(60));
  console.log("Key".padEnd(40) + "Name");
  console.log("-".repeat(60));
  for (const network of svmNetworks) {
    console.log(`${network.key.padEnd(40)}${network.name}`);
  }

  console.log();
  console.log("=".repeat(60));
  console.log("Use these keys with commands like:");
  console.log(
    "  pnpm transfer --source ethereum-testnet-sepolia --dest ethereum-testnet-sepolia-base-1"
  );
  console.log("  pnpm fees --source solana-devnet --dest ethereum-testnet-sepolia");
  console.log("=".repeat(60));
}

main();
