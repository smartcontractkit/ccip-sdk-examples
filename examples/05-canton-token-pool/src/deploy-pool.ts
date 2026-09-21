/**
 * CCIP SDK Example: Deploy a Canton CCT token pool (one atomic tx) + validate.
 *
 * Shows the whole SDK surface an integrator needs:
 *   deploy   — generateUnsignedDeployTokenPool → wallet prepareExecute → approve
 *   validate — getTokenPoolState / getTokenAdminRegistry / getRateLimiterState
 *
 * Usage:
 *   pnpm deploy
 *
 * Prerequisites: fill in .env (see .env.example) — CANTON_GATEWAY_URL,
 * CANTON_GATEWAY_ACCESS_TOKEN, CANTON_INSTRUMENT_ID, CANTON_OBSERVERS,
 * CANTON_REMOTE_CHAIN_SELECTOR, CANTON_REMOTE_TOKEN_ADDRESS, CANTON_REMOTE_POOLS.
 */
import 'dotenv/config'
import * as readline from 'node:readline'

import {
  CantonTokenManager,
  deriveTokenConfigInstanceAddress,
  getCantonNetworkConfig,
} from '@chainlink/ccip-sdk/cct/canton'
import { CantonChain } from '@chainlink/ccip-sdk'
import {
  createGatewayLedgerFetch,
  ensureGatewaySession,
  fetchGatewayPrimaryParty,
  submitViaGateway,
} from './wallet-gateway.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required env var ${name} — see .env.example`)
  return value
}

const gatewayUrl = requireEnv('CANTON_GATEWAY_URL')
const accessToken = requireEnv('CANTON_GATEWAY_ACCESS_TOKEN')
const chainId = process.env['CANTON_CHAIN_ID'] ?? 'canton:TestNet'
const network = getCantonNetworkConfig(chainId)
if (!network) throw new Error(`no well-known config for ${chainId}`)
const ledgerUrl = network.ledgerUrl
if (!ledgerUrl) throw new Error(`No ledger URL for ${chainId} — this network needs an explicit one`)
const edsUrl = network.edsUrl
if (!edsUrl) throw new Error(`No EDS URL for ${chainId} — this network needs an explicit one`)
const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))
const ccipOwner = network.ccipOwner

// ── Setup: chain + manager (all ledger access via the wallet gateway) ──────
await ensureGatewaySession({ gatewayUrl, accessToken, networkId: 'canton:chainlink-testnet' })
const chain = await CantonChain.fromUrl(ledgerUrl, {
  fetch: createGatewayLedgerFetch({ gatewayUrl, accessToken, ledgerBaseUrl: ledgerUrl }),
  cantonConfig: {
    party: owner,
    ccipParty: ccipOwner,
    jwt: accessToken,
    // The EDS disclosure service — REQUIRED for external parties: the deploy
    // resolves the TAR contract through it (TAR is signatory-only to ccipOwner,
    // so no external party can ACS-read it; the EDS disclosure endpoint is
    // public and unauthenticated by design).
    edsUrl,
    transferInstructionUrl: 'http://unused-here.local', // unused by this flow
    chainId,
  },
})
const manager = CantonTokenManager.fromChain(chain)

// ── Deploy: one atomic tx (create pool + Initialize: TAR registration, lane
//    wiring, 3 rate limiters, SetPool) ──────────────────────────────────────
const instrumentId = requireEnv('CANTON_INSTRUMENT_ID')
const decimals = Number(process.env['CANTON_DECIMALS'] ?? '10')
const selector = BigInt(requireEnv('CANTON_REMOTE_CHAIN_SELECTOR'))
const poolType = (process.env['CANTON_POOL_TYPE'] ?? 'burnMint') as 'burnMint' | 'lockRelease'
const poolInstanceId = process.env['CANTON_POOL_INSTANCE_ID'] || `${instrumentId.toLowerCase()}-pool-001`
const scale = 10n ** BigInt(decimals)
const capacity = BigInt(process.env['CANTON_RL_CAPACITY'] ?? '1000000') * scale
const rate = BigInt(process.env['CANTON_RL_RATE'] ?? '100') * scale
const remoteTokenAddress = requireEnv('CANTON_REMOTE_TOKEN_ADDRESS')
const remotePools = requireEnv('CANTON_REMOTE_POOLS')
const ccv = requireEnv('CANTON_CCV')
const observers = requireEnv('CANTON_OBSERVERS')

const unsigned = await manager.generateUnsignedDeployTokenPool({
  poolType,
  instanceId: poolInstanceId,
  poolOwner: owner,
  ccipOwner,
  instrumentId: { admin: owner, id: instrumentId },
  decimals,
  observers: observers.split(','),
  admin: owner,
  tokenAdminRegistryInstanceAddress: network.tokenAdminRegistry,
  lanes: [
    {
      remoteChainSelector: selector,
      remotePools: remotePools.split(','),
      remoteTokenAddress,
      inboundCCVs: ccv.split(','),
      outboundCCVs: ccv.split(','),
      inbound: {
        instanceId: `${poolInstanceId}-rl-in-${selector}`,
        isEnabled: true,
        capacity,
        rate,
      },
      outbound: {
        instanceId: `${poolInstanceId}-rl-out-${selector}`,
        isEnabled: true,
        capacity,
        rate,
      },
      inboundCustomFinality: {
        instanceId: `${poolInstanceId}-rl-in-custom-${selector}`,
        isEnabled: true,
        capacity,
        rate,
      },
    },
  ],
  sender: owner,
})

const { approveUrl } = await submitViaGateway({ gatewayUrl, accessToken, unsigned })
console.error('Approve at:', approveUrl)
const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
await new Promise<void>((r) =>
  rl.question('press Enter after approving… ', () => {
    rl.close()
    r()
  }),
)

// ── Validate: reads only, no wallet ────────────────────────────────────────
const poolInstanceAddress = `${poolInstanceId}@${owner}`
const pool = await manager.getTokenPoolState({
  poolInstanceAddress,
  poolType,
  poolOwner: owner,
})
const tar = await manager.getTokenAdminRegistry({
  tokenConfigInstanceAddress: deriveTokenConfigInstanceAddress(
    { admin: owner, id: instrumentId },
    ccipOwner,
  ),
  adminParty: owner,
})
const rlIn = await manager.getRateLimiterState({
  rateLimiterInstanceAddress: `${poolInstanceId}-rl-in-${selector}@${owner}`,
  poolOwner: owner,
})

console.error('\n── deployment state ──')
console.error(
  'pool:',
  pool.poolInstanceId,
  '| instrument:',
  pool.instrumentId.id,
  '| decimals:',
  pool.decimals,
  '| observers:',
  pool.observers,
)
console.error('lane:', JSON.stringify(pool.remoteChainConfigs, null, 1))
console.error(
  'TAR:',
  `admin=${tar.admin}`,
  `| pool=${tar.tokenPool?.poolInstanceId}`,
  `| factories: burnMint=${tar.burnMintFactorySet} transfer=${tar.transferFactorySet}`,
)
console.error(
  'rate limiter (in):',
  `enabled=${rlIn.isEnabled}`,
  `capacity=${rlIn.capacity}`,
  `rate=${rlIn.rate}`,
)
