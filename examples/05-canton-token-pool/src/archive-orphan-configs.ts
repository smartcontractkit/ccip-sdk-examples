/**
 * CCIP SDK Example: archive every September-era TAR TokenConfig owned by the
 * acting party — i.e. contracts of the OLD ccip-core-v2 2.1.1 package
 * (35086e11…), not the current core (7a08ead9…). The old TokenConfigs are the
 * last active contracts pinning packages carried only by the Sept
 * ccip-registry-lock-release-token-pool-v2:2.1.1 DAR, whose removal they would
 * otherwise block ("package still has active contracts").
 *
 * The filter is the concrete package id in the ACS templateId — current-gen
 * TokenConfigs (e.g. testlink5's live config) are NEVER matched.
 *
 * One transaction per contract: the gateway's prepareExecute rejects
 * multi-command submissions. With user-JWT auth each tx gets its own
 * approveUrl — all are printed up front, approve each in the browser, then
 * press Enter.
 *
 * NOTE: archiving needs the 35086e11… package vetted on all informee
 * participants; if unvetted, the submit fails with
 * INVALID_PRESCRIBED_SYNCHRONIZER_ID naming the participants to vet on.
 *
 * Usage: pnpm tsx src/archive-orphan-configs.ts          # archive Sept-era configs
 *        pnpm tsx src/archive-orphan-configs.ts --dry    # list only
 */
import 'dotenv/config'
import * as readline from 'node:readline'

import { CantonChain } from '@chainlink/ccip-sdk'
import { decodeDamlRecord, extractFieldValue } from '@chainlink/ccip-sdk/cct/canton'
import { TOKEN_CONFIG_TEMPLATE_ID } from '@chainlink/ccip-sdk/src/cct/canton/constants.ts'
import {
  createGatewayCantonProvider,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
  submitViaGateway,
} from './wallet-gateway.js'

/** September-era ccip-core-v2 2.1.1 package id (superseded by 7a08ead9…). */
const SEPT_CORE_PACKAGE_ID = '35086e11b8984749fa11117698187768af4550987924602e33e78624ba4b50e3'

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

const configs = (
  await chain.findActiveContractsByTemplate(TOKEN_CONFIG_TEMPLATE_ID, [owner])
).filter((c) => c.templateId.startsWith(SEPT_CORE_PACKAGE_ID))
console.error(
  `found ${configs.length} active Sept-era TokenConfig(s) (core ${SEPT_CORE_PACKAGE_ID.slice(0, 8)}…) for ${owner}`,
)
for (const c of configs) {
  const f = decodeDamlRecord(c.createArgument)
  const instrument = decodeDamlRecord(f['instrumentId'])
  console.error(
    `  ${extractFieldValue(instrument['id'])}@${extractFieldValue(instrument['admin'])}  cid=${c.contractId}`,
  )
}

if (process.argv.includes('--dry') || configs.length === 0) {
  console.error(configs.length === 0 ? 'nothing to archive' : 'dry run — no submission')
  process.exit(0)
}

const runId = Date.now()
const approvals: string[] = []
for (const [i, c] of configs.entries()) {
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
              templateId: c.templateId,
              contractId: c.contractId,
              choice: 'Archive',
              choiceArgument: {},
            },
          },
        ],
        commandId: `cct-archive-orphan-configs-${runId}-${i}`,
        actAs: [owner],
      },
    },
  })
  if (approveUrl) {
    approvals.push(approveUrl)
    console.error(`  [${i + 1}/${configs.length}] approve: ${approveUrl}`)
  } else {
    console.error(`  [${i + 1}/${configs.length}] executed (API-key auth)`)
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
console.error(`archived ${configs.length} Sept-era TokenConfig(s) ✓`)
