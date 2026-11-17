/**
 * Debug: print the pool owner's active TransferPreapproval as resolved by the
 * SDK's deploy-time auto-wire (resolveTransferPreapprovalCid).
 *
 * Usage: npx tsx src/debug-preapproval.ts
 */
import 'dotenv/config'

import { getCantonNetworkConfig, resolveTransferPreapprovalCid } from '@chainlink/ccip-sdk/cct/canton'
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

const resolved = await resolveTransferPreapprovalCid(chain, owner, { admin: owner, id: instrumentIdRaw })
console.error(`resolveTransferPreapprovalCid() → ${resolved ?? 'NOT FOUND'}`)
