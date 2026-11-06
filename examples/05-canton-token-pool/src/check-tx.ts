/**
 * Verify a Canton update ID (e.g. from a Lighthouse explorer link) against the
 * ledger: fetch the transaction and print what it created/exercised.
 *
 * Usage: pnpm tsx src/check-tx.ts <updateId>
 */
import 'dotenv/config'

import { getCantonNetworkConfig } from '@chainlink/ccip-sdk/cct/canton'
import { CantonChain } from '@chainlink/ccip-sdk'
import {
  createGatewayLedgerFetch,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
} from './wallet-gateway.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required env var ${name}`)
  return value
}

const updateId = process.argv[2]
if (!updateId) throw new Error('usage: tsx src/check-tx.ts <updateId>')

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

const tx = (await chain.provider.getUpdateById(updateId, owner)) as Record<string, unknown>
if (process.env['DEBUG_RAW']) {
  console.log(JSON.stringify(tx))
  process.exit(0)
}
// JsUpdate oneof: { Transaction: { value: JsTransaction } } | { Reassignment: ... }
const value = (
  (tx['update'] as Record<string, unknown> | undefined)?.['Transaction'] as
    | { value?: { updateId?: string; events?: unknown[] } }
    | undefined
)?.value
if (!value) {
  console.error('update not found (or not visible to this party):', updateId)
  process.exitCode = 1
} else {
  console.error('updateId:', value.updateId)
  for (const event of value.events ?? []) {
    const e = event as Record<string, Record<string, unknown> | undefined>
    if (e.CreatedEvent) {
      const c = e.CreatedEvent
      const args = c.createArgument as Record<string, unknown> | undefined
      console.error(
        'created:',
        String(c.templateId).split(':').slice(-2).join(':'),
        '| instanceId:',
        args?.['instanceId'] ?? args?.['instrumentId'] ?? '',
        '| cid:',
        String(c.contractId).slice(0, 16) + '…',
      )
    } else if (e.ExercisedEvent) {
      console.error(
        'exercised:',
        String(e.ExercisedEvent.templateId).split(':').slice(-2).join(':'),
        '| choice:',
        e.ExercisedEvent.choice,
      )
    } else if (e.ArchivedEvent) {
      console.error('archived:', String(e.ArchivedEvent.templateId).split(':').slice(-2).join(':'))
    }
  }
}
