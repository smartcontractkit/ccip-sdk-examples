/**
 * CCIP SDK Example: set the allowed finality config on an EVM TokenPool
 * (v2.0.0 pools) — the Faster-Than-Finality (FTF) block depth and/or the Fast
 * Confirmation Rule (FCR/safe) the pool accepts, via `setAllowedFinalityConfig`.
 *
 * Usage:
 *   OPS_FINALITY=depth:1 pnpm set-evm-pool-finality-config
 *
 * Env (see .env.example):
 *   EVM_RPC_URL / EVM_POOL_ADDRESS     the EVM pool
 *   EVM_PRIVATE_KEY                    the pool owner's key (unset = dry run)
 *   OPS_FINALITY                       'finalized' | 'safe' | 'depth:N' (default depth:1)
 *
 * `setAllowedFinalityConfig` is owner-only. The config is the pool's bytes4
 * FinalityCodec value: bit 0 of the high half-word enables FCR (safe), the
 * low half-word is the FTF block depth (0 = disabled). Mirrors the SDK's
 * encodeFinality. Idempotent: exits without submitting if the pool already
 * has the target config.
 */
import "dotenv/config";

import { Contract, JsonRpcProvider, Wallet, toBeHex } from "ethers";

const TOKEN_POOL_ABI = [
  "function setAllowedFinalityConfig(bytes4 finalityConfig) external",
  "function getAllowedFinalityConfig() view returns (bytes4)",
  "function owner() view returns (address)",
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name} — see .env.example`);
  return value;
}

/** Encode OPS_FINALITY as the pool's bytes4 FinalityCodec value. */
function encodeFinalityConfig(spec: string): number {
  if (spec === "finalized") return 0;
  if (spec === "safe") return 0x0001_0000;
  const depth = Number(spec.slice("depth:".length));
  if (!Number.isInteger(depth) || depth < 1 || depth > 65535) {
    throw new Error(
      `OPS_FINALITY: invalid "${spec}" — use 'finalized', 'safe', or 'depth:N' (1–65535)`
    );
  }
  return depth;
}

const spec = process.env.OPS_FINALITY ?? "depth:1";
const encoded = encodeFinalityConfig(spec);
const target = toBeHex(encoded, 4);

const provider = new JsonRpcProvider(requireEnv("EVM_RPC_URL"));
const pool = new Contract(requireEnv("EVM_POOL_ADDRESS"), TOKEN_POOL_ABI, provider);

const current = toBeHex((await pool.getAllowedFinalityConfig!()) as bigint, 4);
console.error(`pool                    ${await pool.getAddress()}`);
console.error(`allowed finality config ${current} → ${target} (${spec})`);

if (current.toLowerCase() === target.toLowerCase()) {
  console.error(`already at ${target} — nothing to do ✓`);
  process.exit(0);
}

const privateKey = process.env.EVM_PRIVATE_KEY;
if (!privateKey) {
  console.error("\nEVM_PRIVATE_KEY not set — dry run, encoded calldata:");
  console.error(pool.interface.encodeFunctionData("setAllowedFinalityConfig", [target]));
  process.exit(0);
}

const wallet = new Wallet(privateKey, provider);
const poolOwner = (await pool.owner!()) as string;
if (wallet.address.toLowerCase() !== poolOwner.toLowerCase()) {
  throw new Error(`key ${wallet.address} is not the pool owner (${poolOwner})`);
}

const tx = (await (pool.connect(wallet) as Contract).setAllowedFinalityConfig!(target)) as {
  hash: string;
  wait(): Promise<{ blockNumber: number }>;
};
console.error(`\n⏳ sent: ${tx.hash}`);
const receipt = await tx.wait();
console.error(`✓ mined in block ${receipt.blockNumber}`);

const after = toBeHex((await pool.getAllowedFinalityConfig!()) as bigint, 4);
if (after.toLowerCase() !== target.toLowerCase()) {
  throw new Error(`finality readback ${after} does not match ${target}`);
}
console.error("✓ readback matches");
