/**
 * CCIP SDK Example: list active token-pool contracts visible to the pool owner
 * party (ACS read as the gateway's primary party) — a discovery helper for
 * pointing `validate` / `ops` at the right instanceId.
 *
 * Usage: pnpm list-pools            # both pool types, all instances
 *        CANTON_POOL_TYPE=burnMint pnpm list-pools
 *        CANTON_INSTRUMENT_ID=TESTLINK5 pnpm list-pools   # filter by instrument id
 */
import "dotenv/config";

import {
  POOL_TEMPLATE_IDS,
  decodeDamlRecord,
  extractFieldValue,
  extractRecordField,
} from "@chainlink/ccip-sdk/cct/canton";
import { CantonChain } from "@chainlink/ccip-sdk";
import {
  createGatewayCantonProvider,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
} from "./wallet-gateway.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name} — see .env.example`);
  return value;
}

const gatewayUrl = requireEnv("CANTON_GATEWAY_URL");
const accessToken = requireEnv("CANTON_GATEWAY_ACCESS_TOKEN");
const chainId = process.env.CANTON_CHAIN_ID ?? "canton:TestNet";
const owner =
  process.env.CANTON_POOL_OWNER || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }));

await ensureGatewaySession({ gatewayUrl, accessToken, networkId: "canton:chainlink-testnet" });
const chain = await CantonChain.fromProvider(
  createGatewayCantonProvider({ gatewayUrl, accessToken, networkId: chainId, partyId: owner }),
  { cantonConfig: { ccipParty: undefined } }
);

const poolType = process.env.CANTON_POOL_TYPE;
const types = poolType
  ? [poolType as keyof typeof POOL_TEMPLATE_IDS]
  : (["burnMint", "lockRelease"] as const);
const instrumentFilter = process.env.CANTON_INSTRUMENT_ID;

for (const type of types) {
  const pools = await chain.findActiveContractsByTemplate(POOL_TEMPLATE_IDS[type], [owner]);
  for (const pool of pools) {
    const args = decodeDamlRecord(pool.createArgument);
    const instanceId = extractFieldValue(args.instanceId);
    const instrument = extractRecordField(args, "instrumentId") ?? {};
    const id = extractFieldValue(instrument.id);
    if (instrumentFilter && id !== instrumentFilter) continue;
    const observers = JSON.stringify(args.observers ?? []);
    console.log(`${type}\t${instanceId}\t${id}\tobservers=${observers}\t${pool.contractId}`);
  }
}
