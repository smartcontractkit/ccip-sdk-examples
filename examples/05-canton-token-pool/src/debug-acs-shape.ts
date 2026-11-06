import 'dotenv/config'
import { getCantonNetworkConfig } from '@chainlink/ccip-sdk/cct/canton'
import { CantonChain } from '@chainlink/ccip-sdk'
import { createGatewayLedgerFetch, ensureGatewaySession } from './wallet-gateway.js'

const gatewayUrl = process.env['CANTON_GATEWAY_URL'] as string
const accessToken = process.env['CANTON_GATEWAY_ACCESS_TOKEN'] as string
const network = getCantonNetworkConfig('canton:TestNet')
if (!network?.ledgerUrl) throw new Error('no ledger url')
const owner = process.env['CANTON_POOL_OWNER'] as string
await ensureGatewaySession({ gatewayUrl, accessToken, networkId: 'canton:chainlink-testnet' })
const chain = await CantonChain.fromUrl(network.ledgerUrl, {
  fetch: createGatewayLedgerFetch({ gatewayUrl, accessToken, ledgerBaseUrl: network.ledgerUrl }),
  cantonConfig: {
    party: owner,
    ccipParty: network.ccipOwner,
    jwt: accessToken,
    edsUrl: 'http://x.local',
    transferInstructionUrl: 'http://x.local',
    chainId: 'canton:TestNet',
  },
})
const { offset } = await chain.provider.getLedgerEnd()
const res = await chain.provider.getActiveContracts({
  activeAtOffset: offset,
  eventFormat: { filtersByParty: { [owner]: { cumulative: [] } }, verbose: true },
})
for (const r of res) {
  const entry = (r as Record<string, unknown>)['contractEntry'] as Record<string, unknown> | undefined
  const ac = entry?.['JsActiveContract'] as Record<string, unknown> | undefined
  if (!ac) continue
  const created = ac['createdEvent'] as Record<string, unknown> | undefined
  console.error('JsActiveContract keys:', Object.keys(ac).join(', '))
  console.error('createdAt =', JSON.stringify(ac['createdAt']))
  console.error('createdEvent keys:', Object.keys(created ?? {}).join(', '))
  console.error('createdEvent.offset =', JSON.stringify(created?.['offset']))
  break
}
