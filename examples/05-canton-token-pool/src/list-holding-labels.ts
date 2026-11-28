/**
 * CCIP SDK Example: list the acting party's registry holdings (optionally for
 * one instrument) with every field of each holding, label included. Read-only.
 *
 * The CLI's `canton list-holdings` does not show holding labels. A lock-release
 * pool needs `ccip-public`-labelled holdings for the EDS / DA bridge to find
 * its liquidity, so this prints the raw fields of each
 * Utility.Registry.Holding.V0.Holding contract visible to the party.
 *
 * Usage: CANTON_INSTRUMENT_ID=TESTLINK7LR pnpm tsx src/list-holding-labels.ts
 *        pnpm tsx src/list-holding-labels.ts                # all instruments
 */
import "dotenv/config";

import { CantonChain } from "@chainlink/ccip-sdk";
import { decodeDamlRecord, extractFieldValue } from "@chainlink/ccip-sdk/cct/canton";
import {
  createGatewayCantonProvider,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
} from "./wallet-gateway.js";

/** Registry holding template, package-name form (ACS filters reject package ids). */
const HOLDING_TEMPLATE_ID =
  "#utility-registry-holding-v0:Utility.Registry.Holding.V0.Holding:Holding";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
  return value;
}

const gatewayUrl = requireEnv("CANTON_GATEWAY_URL");
const accessToken = requireEnv("CANTON_GATEWAY_ACCESS_TOKEN");
const chainId = process.env.CANTON_CHAIN_ID ?? "canton:TestNet";
const instrument = process.env.CANTON_INSTRUMENT_ID;
const owner =
  process.env.CANTON_POOL_OWNER || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }));

await ensureGatewaySession({ gatewayUrl, accessToken, networkId: "canton:chainlink-testnet" });
const chain = await CantonChain.fromProvider(
  createGatewayCantonProvider({ gatewayUrl, accessToken, networkId: chainId, partyId: owner }),
  { cantonConfig: { ccipParty: undefined } }
);

const holdings = await chain.findActiveContractsByTemplate(HOLDING_TEMPLATE_ID, [owner], (arg) => {
  if (!instrument) return true;
  try {
    return JSON.stringify(arg).includes(instrument);
  } catch {
    return false;
  }
});

/** Render a decoded Daml value on one line. */
function show(value: unknown): string {
  const v = extractFieldValue(value);
  if (v && typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

console.error(
  `found ${holdings.length} holding(s) visible to ${owner}${instrument ? ` for ${instrument}` : ""}\n`
);
for (const h of holdings) {
  const fields = decodeDamlRecord(h.createArgument);
  console.error(h.contractId);
  for (const [key, value] of Object.entries(fields)) {
    console.error(`    ${key}: ${show(value)}`);
  }
  console.error("");
}
