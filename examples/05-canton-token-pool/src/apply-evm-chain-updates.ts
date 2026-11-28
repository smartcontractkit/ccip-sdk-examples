/**
 * CCIP SDK Example: Apply a remote-chain update to an EVM TokenPool — the
 * "reverse link" for a Canton pool: tells the EVM pool about the Canton
 * chain, the Canton pool's instance address, and the Canton instrument's
 * encoded instrument ID.
 *
 * Usage:
 *   pnpm apply-evm-chain-updates
 *
 * The Canton-side values are derived, not pasted:
 * `remotePoolAddress = keccak256("<poolInstanceId>@<cantonPoolOwner>")` and
 * `remoteTokenAddress = keccak256("<instrumentId>@<cantonPoolOwner>")`,
 * matching contracts.EncodeInstrumentID / instance-address derivation in Go.
 * Override either with EVM_REMOTE_POOL_ADDRESS / EVM_REMOTE_TOKEN_ADDRESS.
 *
 * `applyChainUpdates` is `onlyOwner` on the EVM pool — EVM_PRIVATE_KEY must be
 * the pool owner's key. If EVM_PRIVATE_KEY is unset, prints the encoded
 * calldata instead of sending (dry run). If the selector is already wired,
 * it's removed and re-added in the same tx (the pool rejects re-adding).
 *
 * Optional finality (v2.0.0 pools): OPS_FINALITY='finalized' | 'safe' |
 * 'depth:N' sets the pool's allowed finality modes via
 * `setAllowedFinalityConfig(bytes4)` in the same run — FTF block depth and/or
 * the Fast Confirmation Rule. Unset: the finality config is left untouched.
 */
import "dotenv/config";

import {
  Contract,
  JsonRpcProvider,
  Wallet,
  id as keccak256Utf8,
  parseUnits,
  toBeHex,
} from "ethers";

import { fetchGatewayPrimaryParty } from "./wallet-gateway.js";

const TOKEN_POOL_ABI = [
  "function applyChainUpdates(uint64[] remoteChainSelectorsToRemove, tuple(uint64 remoteChainSelector, bytes[] remotePoolAddresses, bytes remoteTokenAddress, tuple(bool isEnabled, uint128 capacity, uint128 rate) outboundRateLimiterConfig, tuple(bool isEnabled, uint128 capacity, uint128 rate) inboundRateLimiterConfig)[] chainsToAdd) external",
  "function getRemoteChains() view returns (uint64[])",
  "function getSupportedChains() view returns (uint64[])",
  "function getRemotePools(uint64) view returns (bytes[])",
  "function getRemoteToken(uint64) view returns (bytes)",
  "function owner() view returns (address)",
  "function setAllowedFinalityConfig(bytes4 finalityConfig) external",
  "function getAllowedFinalityConfig() view returns (bytes4)",
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name} — see .env.example`);
  return value;
}

/**
 * Encode OPS_FINALITY ('finalized' | 'safe' | 'depth:N') as the pool's bytes4
 * FinalityCodec value: bit 0 of the high half-word enables the Fast
 * Confirmation Rule (safe), the low half-word is the FTF block depth
 * (0 = disabled). Mirrors the SDK's encodeFinality.
 */
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

async function main(): Promise<void> {
  const rpcUrl = requireEnv("EVM_RPC_URL");
  const poolAddress = requireEnv("EVM_POOL_ADDRESS");
  // The EVM pool's lane is keyed by the REMOTE chain = Canton. NOT
  // CANTON_REMOTE_CHAIN_SELECTOR — that's the remote from the Canton pool's
  // perspective (the EVM chain). Canton's own selector lives in
  // EVM_REMOTE_CHAIN_SELECTOR (testnet: 9268731218649498074).
  const remoteChainSelector = requireEnv("EVM_REMOTE_CHAIN_SELECTOR");
  const owner =
    process.env.CANTON_POOL_OWNER ||
    (await fetchGatewayPrimaryParty({
      gatewayUrl: requireEnv("CANTON_GATEWAY_URL"),
      accessToken: requireEnv("CANTON_GATEWAY_ACCESS_TOKEN"),
    }));
  const instrumentId = process.env.CANTON_INSTRUMENT_ID;
  const poolInstanceId =
    process.env.CANTON_POOL_INSTANCE_ID || `${instrumentId?.toLowerCase()}-pool-001`;

  let remotePoolAddress = process.env.EVM_REMOTE_POOL_ADDRESS;
  let remoteTokenAddress = process.env.EVM_REMOTE_TOKEN_ADDRESS;
  if (!remotePoolAddress || !remoteTokenAddress) {
    if (!owner || !instrumentId) {
      throw new Error(
        "provide either CANTON_POOL_OWNER+CANTON_INSTRUMENT_ID (to derive) or explicit " +
          "EVM_REMOTE_POOL_ADDRESS+EVM_REMOTE_TOKEN_ADDRESS"
      );
    }
    remotePoolAddress ??= keccak256Utf8(`${poolInstanceId}@${owner}`).toLowerCase();
    remoteTokenAddress ??= keccak256Utf8(`${instrumentId}@${owner}`).toLowerCase();
  }

  // Rate limits live on the EVM pool — scale by the EVM token's decimals (TKN = 18),
  // NOT the Canton-side decimals.
  const decimals = Number(process.env.EVM_DECIMALS ?? "18");
  const enabled = process.env.CANTON_RATE_LIMITS_ENABLED !== "false";
  const rateLimit = {
    isEnabled: enabled,
    capacity: parseUnits(process.env.CANTON_RL_CAPACITY ?? "1000000", decimals),
    rate: parseUnits(process.env.CANTON_RL_RATE ?? "100", decimals),
  };

  const update = {
    remoteChainSelector: BigInt(remoteChainSelector),
    remotePoolAddresses: [remotePoolAddress],
    remoteTokenAddress,
    outboundRateLimiterConfig: rateLimit,
    inboundRateLimiterConfig: rateLimit,
  };

  console.error("applyChainUpdates on EVM pool:");
  console.error("  pool                ", poolAddress);
  console.error("  remoteChainSelector ", remoteChainSelector);
  console.error(
    "  remotePoolAddress   ",
    remotePoolAddress,
    ` (keccak of "${poolInstanceId}@<owner>")`
  );
  console.error(
    "  remoteTokenAddress  ",
    remoteTokenAddress,
    ` (keccak of "${instrumentId}@<owner>")`
  );
  console.error(
    "  rate limits         ",
    `enabled=${enabled} capacity=${rateLimit.capacity} rate=${rateLimit.rate}`
  );

  const privateKey = process.env.EVM_PRIVATE_KEY;
  const provider = new JsonRpcProvider(rpcUrl);
  const pool = new Contract(poolAddress, TOKEN_POOL_ABI, provider);

  const poolOwner = (await pool.owner!()) as string;
  console.error("  pool owner          ", poolOwner);

  // The EVM pool rejects adding a chain that already has a config — if this
  // selector is already wired, remove it first (same tx) to replace it.
  // 2.0 pools call it getRemoteChains; 1.5.x pools call it getSupportedChains.
  let existingChains: bigint[];
  try {
    existingChains = (await pool.getRemoteChains!()) as bigint[];
  } catch {
    existingChains = (await pool.getSupportedChains!()) as bigint[];
  }
  const removals = existingChains.includes(update.remoteChainSelector)
    ? [update.remoteChainSelector]
    : [];
  if (removals.length > 0) {
    console.error(
      "  note                ",
      "selector already wired — removing first, then re-adding"
    );
  }

  if (!privateKey) {
    console.error("\nEVM_PRIVATE_KEY not set — dry run, encoded calldata:");
    console.error(pool.interface.encodeFunctionData("applyChainUpdates", [removals, [update]]));
    const finalitySpec = process.env.OPS_FINALITY;
    if (finalitySpec) {
      console.error(
        pool.interface.encodeFunctionData("setAllowedFinalityConfig", [
          toBeHex(encodeFinalityConfig(finalitySpec), 4),
        ])
      );
    }
    return;
  }

  const wallet = new Wallet(privateKey, provider);
  if (wallet.address.toLowerCase() !== poolOwner.toLowerCase()) {
    throw new Error(`key ${wallet.address} is not the pool owner (${poolOwner})`);
  }

  const tx = (await (pool.connect(wallet) as Contract).applyChainUpdates!(removals, [update])) as {
    hash: string;
    wait(): Promise<{ blockNumber: number }>;
  };
  console.error(`\n⏳ sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.error(`✓ mined in block ${receipt.blockNumber}`);

  // Optional: set the pool's allowed finality modes (v2.0.0 pools only).
  const finalitySpec = process.env.OPS_FINALITY;
  if (finalitySpec) {
    const encoded = encodeFinalityConfig(finalitySpec);
    console.error(`\nsetAllowedFinalityConfig: ${finalitySpec} → ${toBeHex(encoded, 4)}`);
    const ftx = (await (pool.connect(wallet) as Contract).setAllowedFinalityConfig!(
      toBeHex(encoded, 4)
    )) as { hash: string; wait(): Promise<{ blockNumber: number }> };
    console.error(`⏳ sent: ${ftx.hash}`);
    const freceipt = await ftx.wait();
    console.error(`✓ mined in block ${freceipt.blockNumber}`);
    const onChain = (await pool.getAllowedFinalityConfig!()) as string;
    if (BigInt(onChain) !== BigInt(encoded)) {
      throw new Error(`finality readback ${onChain} does not match ${toBeHex(encoded, 4)}`);
    }
    console.error("✓ finality readback matches");
  }

  // Read back to confirm
  const remoteToken = (await pool.getRemoteToken!(update.remoteChainSelector)) as string;
  const remotePools = (await pool.getRemotePools!(update.remoteChainSelector)) as string[];
  console.error(
    `  on-chain now: remoteToken=${remoteToken.toLowerCase()} remotePools=[${remotePools.map((p) => p.toLowerCase()).join(", ")}]`
  );
  if (
    remoteToken.toLowerCase() !== remoteTokenAddress.toLowerCase() ||
    !remotePools.some((p) => p.toLowerCase() === remotePoolAddress.toLowerCase())
  ) {
    throw new Error("on-chain readback does not match what was sent — check the pool state");
  }
  console.error("✓ readback matches");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
