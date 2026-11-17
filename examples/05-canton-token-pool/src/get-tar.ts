/**
 * CCIP SDK Example: print the TAR TokenConfig for an instrument (admin, pending
 * admin, pool registration, factory wiring) — read-only.
 *
 * Usage: CANTON_INSTRUMENT_ID=TESTLINK5 pnpm get-tar
 */
import 'dotenv/config'

import { CantonTokenManager } from '@chainlink/ccip-sdk/cct/canton'
import { CantonChain } from '@chainlink/ccip-sdk'
import {
  createGatewayCantonProvider,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
} from './wallet-gateway.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required env var ${name} — see .env.example`)
  return value
}

const gatewayUrl = requireEnv('CANTON_GATEWAY_URL')
const accessToken = requireEnv('CANTON_GATEWAY_ACCESS_TOKEN')
const chainId = process.env['CANTON_CHAIN_ID'] ?? 'canton:TestNet'
const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))
const instrumentIdRaw = requireEnv('CANTON_INSTRUMENT_ID')

await ensureGatewaySession({ gatewayUrl, accessToken, networkId: 'canton:chainlink-testnet' })
const chain = await CantonChain.fromProvider(
  createGatewayCantonProvider({ gatewayUrl, accessToken, networkId: chainId, partyId: owner }),
  { cantonConfig: { ccipParty: undefined } },
)
const manager = CantonTokenManager.fromChain(chain)

const tar = await manager.getTokenAdminRegistry({
  instrumentId: { admin: owner, id: instrumentIdRaw },
  adminParty: owner,
})
console.log(`TokenConfig for ${instrumentIdRaw} (admin=${owner}):`)
console.log(`  admin:           ${tar.admin ?? '(none)'}`)
console.log(`  pendingAdmin:    ${tar.pendingAdmin ?? '(none)'}`)
console.log(`  tokenPool:       ${JSON.stringify(tar.tokenPool)}`)
console.log(`  transferFactorySet: ${tar.transferFactorySet}`)
console.log(`  burnMintFactorySet: ${tar.burnMintFactorySet}`)
console.log(`  isCCIPManaged:   ${tar.isCCIPManaged}`)
