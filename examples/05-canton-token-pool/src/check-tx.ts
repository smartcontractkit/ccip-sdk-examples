/**
 * Verify a Canton update ID (e.g. from a Lighthouse explorer link) against the
 * ledger: fetch the transaction and print what it created/exercised.
 *
 * Usage: pnpm tsx src/check-tx.ts <updateId>
 */
import 'dotenv/config'

import {
  createGatewayCantonProvider,
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

const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))

await ensureGatewaySession({ gatewayUrl, accessToken, networkId: 'canton:chainlink-testnet' })
const provider = createGatewayCantonProvider({
  gatewayUrl,
  accessToken,
  networkId: chainId,
  partyId: owner,
})

const tx = (await provider.request({
  method: 'ledgerApi',
  params: { requestMethod: 'post', resource: '/v2/updates/update-by-id', body: { updateId } },
})) as Record<string, unknown>
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
