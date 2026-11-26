/**
 * CCIP SDK Example: update the finality config of an already-enabled lane on a
 * Canton token pool. Reads the lane via `getTokenPoolState`, then removes and
 * re-adds it in ONE `ApplyChainUpdates` tx (no disabled window) — reusing the
 * lane's existing rate limiters, CCVs, remote pools, and remote token address.
 * Only `finalityConfig` changes.
 *
 * Usage:
 *   pnpm set-lane-finality
 *
 * Env (see .env.example):
 *   CANTON_GATEWAY_URL / CANTON_GATEWAY_ACCESS_TOKEN  gateway auth
 *   CANTON_POOL_INSTANCE_ID        optional — defaults to <instrumentId>-pool-001
 *   CANTON_POOL_OWNER              optional — defaults to gateway primary party
 *   CANTON_REMOTE_CHAIN_SELECTOR   e.g. 16015286601757825753 (Sepolia)
 *   OPS_FINALITY                   'finality' | 'safe' | 'depth:N' (default depth:1)
 */
import "dotenv/config";
import * as readline from "node:readline";

import { CantonChain } from "@chainlink/ccip-sdk";
import { CantonTokenManager, getCantonNetworkConfig } from "@chainlink/ccip-sdk/cct/canton";
import type { GetTokenPoolStateResult } from "@chainlink/ccip-sdk/cct/canton";
import {
  createGatewayCantonProvider,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
  submitViaGateway,
} from "./wallet-gateway.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

const gatewayUrl = requireEnv("CANTON_GATEWAY_URL");
const accessToken = requireEnv("CANTON_GATEWAY_ACCESS_TOKEN");
const chainId = process.env.CANTON_CHAIN_ID ?? "canton:TestNet";
const network = getCantonNetworkConfig(chainId);
if (!network) throw new Error(`no well-known config for ${chainId}`);

const owner =
  process.env.CANTON_POOL_OWNER ?? (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }));
const instrumentIdRaw = requireEnv("CANTON_INSTRUMENT_ID");
const poolInstanceId =
  process.env.CANTON_POOL_INSTANCE_ID ?? `${instrumentIdRaw.toLowerCase()}-pool-001`;
const poolInstanceAddress = `${poolInstanceId}@${owner}`;
const selector = BigInt(requireEnv("CANTON_REMOTE_CHAIN_SELECTOR"));

const f = process.env.OPS_FINALITY ?? "depth:1";
const finalityConfig = f.startsWith("depth:")
  ? { type: "BlockDepth" as const, blockConfirmations: Number(f.slice(6)) }
  : f === "safe"
    ? { type: "WaitForSafe" as const }
    : { type: "WaitForFinality" as const };

await ensureGatewaySession({ gatewayUrl, accessToken, networkId: "canton:chainlink-testnet" });
const chain = await CantonChain.fromProvider(
  createGatewayCantonProvider({ gatewayUrl, accessToken, networkId: chainId, partyId: owner }),
  { cantonConfig: { ccipParty: network.ccipOwner } }
);
const manager = CantonTokenManager.fromChain(chain);

// 1. Read the existing lane — everything except finality is reused verbatim.
const pool = await manager.getTokenPoolState({ poolInstanceAddress, poolOwner: owner });
const lane = pool.remoteChainConfigs.find((c) => c.remoteChainSelector === selector.toString());
if (!lane) throw new Error(`lane for chain ${selector} is not enabled on ${poolInstanceAddress}`);
if (finalityConfig.type !== "WaitForFinality" && !lane.inboundCustomBlockConfirmationsRateLimiter) {
  throw new Error(
    `${finalityConfig.type} requires the lane's custom-finality inbound limiter, ` +
      `but none is wired on this lane — enable the lane with one first`
  );
}
if (JSON.stringify(lane.finalityConfig) === JSON.stringify(finalityConfig)) {
  console.error(`lane ${selector}: already at ${JSON.stringify(finalityConfig)} — nothing to do ✓`);
  process.exit(0);
}
console.error(`pool ${poolInstanceAddress} (${pool.poolType})`);
console.error(
  `lane ${selector}: finality ${JSON.stringify(lane.finalityConfig)} → ${JSON.stringify(finalityConfig)}`
);

// 2. Remove + re-add in one tx, reusing the existing limiters/CCVs/addresses.
const { approveUrl } = await submitViaGateway({
  gatewayUrl,
  accessToken,
  unsigned: await manager.generateUnsignedApplyChainUpdates({
    poolInstanceAddress,
    remoteChainSelectorsToRemove: [selector],
    chainsToAdd: [
      {
        remoteChainSelector: selector,
        remotePools: lane.remotePools,
        remoteTokenAddress: lane.remoteTokenAddress,
        inboundCCVs: lane.inboundCCVs,
        outboundCCVs: lane.outboundCCVs,
        finalityConfig,
        inboundRateLimiter: lane.inboundRateLimiter,
        inboundCustomBlockConfirmationsRateLimiter: lane.inboundCustomBlockConfirmationsRateLimiter,
        outboundRateLimiter: lane.outboundRateLimiter,
      },
    ],
    sender: owner,
  }),
});
if (approveUrl) {
  console.error("Approve at:", approveUrl);
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  await new Promise<void>((r) =>
    rl.question("press Enter after approving… ", () => {
      rl.close();
      r();
    })
  );
}

// 3. The gateway signs + submits asynchronously after approval, and
//    ApplyChainUpdates is a consuming choice (old pool stays in the ACS until
//    the new one commits) — poll until the change lands.
type PoolRemoteChainConfig = GetTokenPoolStateResult["remoteChainConfigs"][number];

const matches = (c?: { type: string; blockConfirmations?: number | bigint }) =>
  c?.type === finalityConfig.type &&
  (finalityConfig.type !== "BlockDepth" ||
    Number(c.blockConfirmations) === finalityConfig.blockConfirmations);
let found: PoolRemoteChainConfig | undefined = lane;
for (let i = 0; i < 30 && !matches(found?.finalityConfig); i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const after = await manager.getTokenPoolState({ poolInstanceAddress, poolOwner: owner });
  found = after.remoteChainConfigs.find((c) => c.remoteChainSelector === selector.toString());
}
const got = found?.finalityConfig;
console.error(
  `lane ${selector}: ${found ? "present ✓" : "MISSING ✗"} finality=${JSON.stringify(got)} ` +
    `${matches(got) ? "✓" : "✗ (still propagating? check the explorer)"}`
);
