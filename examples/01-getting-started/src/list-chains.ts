/**
 * CCIP SDK Example: List Supported Chains
 *
 * Lists all supported chain keys grouped by chain family.
 * Use these keys with other commands like transfer, fees, etc.
 *
 * Usage:
 *   pnpm chains
 */

import {
  type ChainFamily,
  getAllNetworks,
  CHAIN_FAMILY_LABELS,
} from "@ccip-examples/shared-config";

function main() {
  console.log("=".repeat(60));
  console.log("CCIP SDK: Supported Chains");
  console.log("=".repeat(60));
  console.log();

  const networks = getAllNetworks();

  // Group networks by chain family dynamically
  const byFamily = new Map<ChainFamily, typeof networks>();
  for (const network of networks) {
    const group = byFamily.get(network.family) ?? [];
    group.push(network);
    byFamily.set(network.family, group);
  }

  for (const [family, group] of byFamily) {
    const label = CHAIN_FAMILY_LABELS[family];
    console.log(`${label}:`);
    console.log("-".repeat(60));
    console.log("Key".padEnd(40) + "Name");
    console.log("-".repeat(60));
    for (const network of group) {
      console.log(`${network.key.padEnd(40)}${network.name}`);
    }
    console.log();
  }

  console.log("=".repeat(60));
  console.log("Use these keys with commands like:");
  console.log(
    "  pnpm transfer --source ethereum-testnet-sepolia --dest ethereum-testnet-sepolia-base-1"
  );
  console.log("  pnpm fees");
  console.log("=".repeat(60));
}

main();
