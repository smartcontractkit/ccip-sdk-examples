/**
 * CCIP SDK Example: archive every orphaned ccip-registry-rate-limiter-v2
 * contract owned by the acting party (default Archive choice, controller =
 * signatory = pool owner). The September-era pools these limiters belonged to
 * are already archived; the limiters pin the old ccip-registry-rate-limiter-v2
 * packages on the participants.
 *
 * One transaction per contract: the gateway's prepareExecute rejects
 * multi-command submissions ("Preparing multiple commands is currently not
 * supported"). With user-JWT auth each tx gets its own approveUrl — all are
 * printed up front, approve each in the browser, then press Enter.
 *
 * Usage: pnpm tsx src/archive-orphan-limiters.ts          # all -v2 limiters
 *        pnpm tsx src/archive-orphan-limiters.ts --dry    # list only
 */
import 'dotenv/config'
import * as readline from 'node:readline'

import { CantonChain } from '@chainlink/ccip-sdk'
import { decodeDamlRecord, extractFieldValue } from '@chainlink/ccip-sdk/cct/canton'
import { RATE_LIMITER_TEMPLATE_ID } from '@chainlink/ccip-sdk/src/cct/canton/token-pool/shared.ts'
import {
  createGatewayCantonProvider,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
  submitViaGateway,
} from './wallet-gateway.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required env var ${name}`)
  return value
}

const gatewayUrl = requireEnv('CANTON_GATEWAY_URL')
const accessToken = requireEnv('CANTON_GATEWAY_ACCESS_TOKEN')
const chainId = process.env['CANTON_CHAIN_ID'] ?? 'canton:TestNet'
const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))

await ensureGatewaySession({ gatewayUrl, accessToken, networkId: 'canton:chainlink-testnet' })
const chain = await CantonChain.fromProvider(
  createGatewayCantonProvider({ gatewayUrl, accessToken, networkId: chainId, partyId: owner }),
  { cantonConfig: { ccipParty: undefined } },
)

const limiters = await chain.findActiveContractsByTemplate(RATE_LIMITER_TEMPLATE_ID, [owner])
console.error(`found ${limiters.length} active ${RATE_LIMITER_TEMPLATE_ID} contract(s) for ${owner}`)
for (const l of limiters) {
  const f = decodeDamlRecord(l.createArgument)
  console.error(
    `  ${extractFieldValue(f['instanceId'])}  (${extractFieldValue(f['poolInstanceId'])}, ` +
      `${extractFieldValue(f['direction'])})  cid=${l.contractId.slice(0, 18)}…`,
  )
}

if (process.argv.includes('--dry') || limiters.length === 0) {
  console.error(limiters.length === 0 ? 'nothing to archive' : 'dry run — no submission')
  process.exit(0)
}

const runId = Date.now()
const approvals: string[] = []
for (const [i, l] of limiters.entries()) {
  const { approveUrl } = await submitViaGateway({
    gatewayUrl,
    accessToken,
    unsigned: {
      family: 'CANTON',
      commands: {
        commands: [
          {
            ExerciseCommand: {
              // concrete templateId from the ACS (exercise commands reject the
              // package-name form)
              templateId: l.templateId,
              contractId: l.contractId,
              choice: 'Archive',
              choiceArgument: {},
            },
          },
        ],
        commandId: `cct-archive-orphan-limiters-${runId}-${i}`,
        actAs: [owner],
      },
    },
  })
  if (approveUrl) {
    approvals.push(approveUrl)
    console.error(`  [${i + 1}/${limiters.length}] approve: ${approveUrl}`)
  } else {
    console.error(`  [${i + 1}/${limiters.length}] executed (API-key auth)`)
  }
}
if (approvals.length > 0) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  await new Promise<void>((r) =>
    rl.question(`press Enter after approving all ${approvals.length}… `, () => {
      rl.close()
      r()
    }),
  )
}
console.error(`archived ${limiters.length} orphaned rate limiter(s) ✓`)
