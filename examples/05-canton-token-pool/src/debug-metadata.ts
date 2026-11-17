/**
 * Debug: read the pool's poolReceiveMetadata and the owner's holdings' meta
 * for the instrument, to trace the disclosure label end to end.
 *
 * Usage: pnpm tsx src/debug-metadata.ts
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

const gatewayUrl = requireEnv('CANTON_GATEWAY_URL')
const accessToken = requireEnv('CANTON_GATEWAY_ACCESS_TOKEN')
const chainId = process.env['CANTON_CHAIN_ID'] ?? 'canton:TestNet'
const network = getCantonNetworkConfig(chainId)
if (!network?.ledgerUrl) throw new Error(`no ledger URL for ${chainId}`)

const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))
const instrumentIdRaw = requireEnv('CANTON_INSTRUMENT_ID')
const poolInstanceId = process.env['CANTON_POOL_INSTANCE_ID'] || `${instrumentIdRaw.toLowerCase()}-pool-001`
const poolInstanceAddress = `${poolInstanceId}@${owner}`

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

// 1. the pool's stored metadata
const pool = await chain.findActiveContractByInstanceAddress(
  '#ccip-registry-lock-release-token-pool:CCIP.Registry.LockReleaseTokenPoolV2:LockReleaseTokenPool',
  poolInstanceAddress,
  [owner],
)
if (!pool) throw new Error('pool not found')
const args = pool.createArgument as Record<string, unknown>
console.error('pool poolReceiveMetadata:', JSON.stringify(args['poolReceiveMetadata']))

// 2. the owner's holdings for the instrument, with their meta
const { offset } = await chain.provider.getLedgerEnd()
const resp = await chain.provider.getActiveContracts({
  activeAtOffset: offset,
  eventFormat: {
    filtersByParty: {
      [owner]: {
        cumulative: [
          {
            identifierFilter: {
              InterfaceFilter: {
                value: {
                  interfaceId:
                    '#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding',
                  includeInterfaceView: true,
                },
              },
            },
          },
        ],
      },
    },
    verbose: true,
  },
})
for (const r of resp) {
  const entry = (r as Record<string, unknown>)['contractEntry'] as Record<string, unknown>
  const ac = (entry?.['JsActiveContract'] ?? {}) as Record<string, unknown>
  const created = ac['createdEvent'] as Record<string, unknown> | undefined
  const views = (created?.['interfaceViews'] ?? []) as Array<Record<string, unknown>>
  for (const v of views) {
    const viewValue = v['viewValue'] as Record<string, unknown> | undefined
    const inst = viewValue?.['instrumentId'] as Record<string, unknown> | undefined
    if (inst?.['id'] === instrumentIdRaw) {
      console.error(
        'holding | owner:',
        viewValue?.['owner'],
        '| amount:',
        viewValue?.['amount'],
        '| meta:',
        JSON.stringify(viewValue?.['meta']),
        '| label:',
        JSON.stringify(viewValue?.['label'] ?? '(no label in view)'),
        '| createArgs:',
        JSON.stringify(((created as Record<string, unknown> | undefined)?.['createArguments'] ?? (created as Record<string, unknown> | undefined)?.['createArgument'] ?? {})),
        '| cid:',
        String(created?.['contractId']),
      )
    }
  }
}
