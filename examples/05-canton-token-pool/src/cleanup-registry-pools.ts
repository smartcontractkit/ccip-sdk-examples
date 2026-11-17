/**
 * Cleanup tool for the registry BM/rate-limiter package-ladder incident:
 * list (and optionally archive) every active contract on the stale packages
 * so they can be unvetted + removed from the participants afterwards.
 *
 * Default targets (overridable via OPS_PACKAGES, comma-separated prefixes):
 *   7343d89e…  ccip-registry-burn-mint-token-pool 1.0.1   (1 live BM pool)
 *   35a93dc2…  ccip-registry-burn-mint-token-pool-v2 2.1.1 (7 live BM pools)
 *   98a50c17…  ccip-registry-rate-limiter 1.0.1            (6 live rate limiters)
 *
 * Usage:
 *   npx tsx src/cleanup-registry-pools.ts          # list (read-only)
 *   npx tsx src/cleanup-registry-pools.ts archive  # archive all owner-signatory contracts (one tx)
 *
 * Archiving uses each contract's OWN concrete templateId + the default
 * `Archive` choice (controller = signatory). Contracts whose signatories
 * don't include the pool owner are skipped with a warning — those block
 * package removal until THEIR owners archive them.
 */
import 'dotenv/config'
import * as readline from 'node:readline'

import { getCantonNetworkConfig } from '@chainlink/ccip-sdk/cct/canton'
import { CantonChain } from '@chainlink/ccip-sdk'
import {
  createGatewayLedgerFetch,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
  submitViaGateway,
} from './wallet-gateway.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required env var ${name}`)
  return value
}

const DEFAULT_TARGETS = [
  '7343d89ea57c7618ed10c62222d27644213eede3bea77d1aae354ed4594fe94e', // registry BM 1.0.1
  '35a93dc2c0d2b65ac5aeffc1ed4f45d72a649adce56919e0354ba75bc88fc170', // registry BM v2 2.1.1
  '98a50c17cbd60b3640bf3f580e4318ef9eef231cb7d838750a407d48bdf5bf72', // registry RL 1.0.1
]
const targets = (process.env['OPS_PACKAGES'] ?? DEFAULT_TARGETS.join(',')).split(',').map((s) => s.trim())

const gatewayUrl = requireEnv('CANTON_GATEWAY_URL')
const accessToken = requireEnv('CANTON_GATEWAY_ACCESS_TOKEN')
const chainId = process.env['CANTON_CHAIN_ID'] ?? 'canton:TestNet'
const network = getCantonNetworkConfig(chainId)
if (!network?.ledgerUrl) throw new Error(`no ledger URL for ${chainId}`)

const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))

await ensureGatewaySession({ gatewayUrl, accessToken, networkId: 'canton:chainlink-testnet' })
const chain = await CantonChain.fromUrl(network.ledgerUrl, {
  fetch: createGatewayLedgerFetch({ gatewayUrl, accessToken, ledgerBaseUrl: network.ledgerUrl }),
  cantonConfig: {
    party: owner,
    ccipParty: network.ccipOwner,
    jwt: accessToken,
    edsUrl: network.edsUrl ?? 'http://unused-here.local',
    transferInstructionUrl: 'http://unused-here.local',
    chainId,
  },
})

interface Found {
  contractId: string
  templateId: string
  createdEventBlob: string
  synchronizerId: string
  signatories: string[]
  instanceId: string
}

const { offset } = await chain.provider.getLedgerEnd()
const responses = await chain.provider.getActiveContracts({
  activeAtOffset: offset,
  eventFormat: { filtersByParty: { [owner]: { cumulative: [] } }, verbose: true },
})

const found: Found[] = []
for (const response of responses) {
  const entry = (response as Record<string, unknown>)['contractEntry'] as Record<string, unknown> | undefined
  const ac = (entry?.['JsActiveContract'] ?? {}) as Record<string, unknown>
  const created = ac['createdEvent'] as Record<string, unknown> | undefined
  if (!created) continue
  const templateId = String(created['templateId'] ?? '')
  if (!targets.some((t) => templateId.startsWith(t))) continue
  const args = (created['createArgument'] ?? {}) as Record<string, unknown>
  found.push({
    contractId: String(created['contractId']),
    templateId,
    createdEventBlob: String(created['createdEventBlob'] ?? ''),
    synchronizerId: String(ac['synchronizerId'] ?? created['domainId'] ?? ''),
    signatories: Array.isArray(created['signatories']) ? (created['signatories'] as string[]) : [],
    instanceId: String(args['instanceId'] ?? '(no instanceId field)'),
  })
}

console.error(`contracts on target packages visible to ${owner.split('::')[0]}: ${found.length}\n`)
const archivable: Found[] = []
for (const f of found) {
  const pkg = (f.templateId.split(':')[0] ?? '').slice(0, 16)
  const tmpl = f.templateId.split(':').slice(1).join(':')
  const ours = f.signatories.includes(owner)
  console.error(
    `  ${ours ? '✓' : '✗ NOT OURS'} ${pkg}… ${tmpl}\n      instanceId: ${f.instanceId}\n      cid: ${f.contractId}\n      signatories: ${f.signatories.map((s) => s.split('::')[0]).join(', ')}`,
  )
  if (ours) archivable.push(f)
}

if (process.argv[2] !== 'archive') {
  console.error(`\n(read-only listing; run with 'archive' to archive the ${archivable.length} owned contracts)`)
  process.exit(0)
}

if (archivable.length === 0) {
  console.error('\nnothing archivable — exiting')
  process.exit(1)
}

// The gateway's prepareExecute supports exactly ONE command per submission
// ("Preparing multiple commands is currently not supported") — archive each
// contract in its own tx. No disclosedContracts: every target contract has the
// owner as signatory, and the owner is hosted on the submitting participant —
// visible locally.
console.error(`\narchiving ${archivable.length} contracts — one tx (one approval) each…`)
let done = 0
for (const f of archivable) {
  const label = `${f.instanceId} (${f.templateId.split(':')[0]?.slice(0, 8)}…)`
  const jsCommands = {
    commands: [
      {
        ExerciseCommand: {
          templateId: f.templateId,
          contractId: f.contractId,
          choice: 'Archive',
          choiceArgument: {},
        },
      },
    ],
    commandId: `cleanup-archive-${crypto.randomUUID()}`,
    actAs: [owner],
  }
  const { approveUrl } = await submitViaGateway({
    gatewayUrl,
    accessToken,
    unsigned: { commands: jsCommands } as never,
  })
  console.error(`\n[${done + 1}/${archivable.length}] ${label}\n  Approve at: ${approveUrl}`)
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  await new Promise<void>((r) =>
    rl.question('  press Enter after approving… ', () => {
      rl.close()
      r()
    }),
  )
  done++
  console.error(`  archived ✓`)
}
console.error(`\nall ${done} archived — verify with a re-run of list mode (expect 0 contracts)`)
