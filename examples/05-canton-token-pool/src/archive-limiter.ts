/**
 * CCIP SDK Example: archive a RateLimiter contract by its raw instance address
 * (default Archive choice, controller = signatory = pool owner).
 *
 * Usage: pnpm tsx src/archive-limiter.ts <rateLimiterInstanceAddress>
 *   e.g. pnpm tsx src/archive-limiter.ts 'testlink2-pool-001-rl-in-16015286601757825753@u_d37a36efeda3::1220c250...'
 */
import "dotenv/config";
import * as readline from "node:readline";

import { RATE_LIMITER_TEMPLATE_ID } from "@chainlink/ccip-sdk/dist/cct/canton/constants.js";
import { CantonChain } from "@chainlink/ccip-sdk";
import {
  createGatewayCantonProvider,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
  submitViaGateway,
} from "./wallet-gateway.js";

const rateLimiterInstanceAddress = process.argv[2];
if (!rateLimiterInstanceAddress) {
  throw new Error("usage: tsx src/archive-limiter.ts <rateLimiterInstanceAddress>");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var ${name}`);
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

const limiter = await chain.findActiveContractByInstanceAddress(
  RATE_LIMITER_TEMPLATE_ID,
  rateLimiterInstanceAddress
);
if (!limiter) throw new Error(`no active RateLimiter at ${rateLimiterInstanceAddress}`);
const signatory = limiter.signatories[0];
if (signatory !== owner) {
  throw new Error(`limiter is signed by ${signatory}, not the configured owner ${owner}`);
}

const { approveUrl } = await submitViaGateway({
  gatewayUrl,
  accessToken,
  unsigned: {
    family: "CANTON",
    commands: {
      commands: [
        {
          ExerciseCommand: {
            templateId: limiter.templateId,
            contractId: limiter.contractId,
            choice: "Archive",
            choiceArgument: {},
          },
        },
      ],
      commandId: `cct-archive-limiter-${Date.now()}`,
      actAs: [owner],
    },
  },
});
console.error("Approve at:", approveUrl);
const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
await new Promise<void>((r) =>
  rl.question("press Enter after approving… ", () => {
    rl.close();
    r();
  })
);
console.error(`rate limiter ${rateLimiterInstanceAddress} archived ✓`);
