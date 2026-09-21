/**
 * CCIP SDK Example: Validate a deployed Canton CCT token pool end-to-end.
 *
 * Checks pool config, TAR registration, lane wiring (addresses + CCVs +
 * limiter references), factory wiring, and all 3 rate limiters — as a
 * pass/fail report. Read-only: no wallet, no signing.
 *
 * Usage:
 *   pnpm validate
 *
 * Exits 0 if every check passes, 1 otherwise.
 */
import 'dotenv/config'

import {
  CantonTokenManager,
  deriveTokenConfigInstanceAddress,
  getCantonNetworkConfig,
  normalizeRemoteAddress,
} from '@chainlink/ccip-sdk/cct/canton'
import { CantonChain } from '@chainlink/ccip-sdk'
import { createGatewayLedgerFetch, ensureGatewaySession, fetchGatewayPrimaryParty } from './wallet-gateway.js'

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

const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))
const ccipOwner = network.ccipOwner

const instrumentIdRaw = requireEnv('CANTON_INSTRUMENT_ID')
const instrumentId = { admin: owner, id: instrumentIdRaw }
const poolType = (process.env['CANTON_POOL_TYPE'] ?? 'burnMint') as 'burnMint' | 'lockRelease'
const poolInstanceId = process.env['CANTON_POOL_INSTANCE_ID'] || `${instrumentIdRaw.toLowerCase()}-pool-001`
const poolInstanceAddress = `${poolInstanceId}@${owner}`
const observers = requireEnv('CANTON_OBSERVERS')
  .split(',')
  .map((s) => s.trim())
const selector = process.env['CANTON_REMOTE_CHAIN_SELECTOR'] ?? ''
const ccvs = (process.env['CANTON_CCV'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const decimals = Number(process.env['CANTON_DECIMALS'] ?? '10')
// Rate-limit capacity/rate are scaled to the pool's decimals on-ledger —
// compare against the scaled form of the config's human-unit values.
const rlScale = 10n ** BigInt(decimals)
const wantCapacity = (BigInt(process.env['CANTON_RL_CAPACITY'] ?? '1000000') * rlScale).toString()
const wantRate = (BigInt(process.env['CANTON_RL_RATE'] ?? '100') * rlScale).toString()
const tokenConfigAddress = deriveTokenConfigInstanceAddress(instrumentId, ccipOwner)
const rlIn = `${poolInstanceId}-rl-in-${selector}@${owner}`
const rlOut = `${poolInstanceId}-rl-out-${selector}@${owner}`
const rlInCustom = `${poolInstanceId}-rl-in-custom-${selector}@${owner}`

await ensureGatewaySession({ gatewayUrl, accessToken, networkId: 'canton:chainlink-testnet' })
const chain = await CantonChain.fromUrl(ledgerUrl, {
  fetch: createGatewayLedgerFetch({ gatewayUrl, accessToken, ledgerBaseUrl: ledgerUrl }),
  cantonConfig: {
    party: owner,
    ccipParty: ccipOwner,
    jwt: accessToken,
    edsUrl: edsUrl ?? 'http://unused-here.local', // unused by these reads
    transferInstructionUrl: 'http://unused-here.local',
    chainId,
  },
})
const manager = CantonTokenManager.fromChain(chain)

// ── Checks ─────────────────────────────────────────────────────────────────

let failures = 0
async function check(name: string, run: () => Promise<{ pass: boolean; detail: string }>) {
  try {
    const { pass, detail } = await run()
    console.error(` ${pass ? '✓' : '✗'} ${name}\n   ${detail}`)
    if (!pass) failures++
  } catch (err) {
    console.error(` ✗ ${name}\n   ${err instanceof Error ? err.message : String(err)}`)
    failures++
  }
}

const getPool = () => manager.getTokenPoolState({ poolInstanceAddress, poolType, poolOwner: owner })
const getTar = () =>
  manager.getTokenAdminRegistry({
    tokenConfigInstanceAddress: tokenConfigAddress,
    adminParty: owner,
  })

await check('Pool deployed with expected config', async () => {
  const state = await getPool()
  const bad: string[] = []
  if (state.poolOwner !== owner) bad.push(`poolOwner: got ${state.poolOwner}, want ${owner}`)
  if (decimals && state.decimals !== decimals)
    bad.push(`decimals: got ${state.decimals}, want ${decimals}`)
  if (state.instrumentId.id !== instrumentId.id)
    bad.push(`instrumentId: got ${state.instrumentId.id}, want ${instrumentId.id}`)
  const missing = observers.filter((o) => !state.observers.includes(o))
  if (missing.length > 0) bad.push(`observers missing: ${missing.join(', ')}`)
  return bad.length === 0
    ? {
        pass: true,
        detail: `owner=${state.poolOwner}, decimals=${state.decimals}, observers=${JSON.stringify(state.observers)}`,
      }
    : { pass: false, detail: bad.join('; ') }
})

await check('Pool registered in TAR (SetPool)', async () => {
  const tar = await getTar()
  if (tar.admin !== owner)
    return { pass: false, detail: `admin: got ${tar.admin ?? '(none)'}, want ${owner}` }
  if (tar.tokenPool?.poolInstanceId !== poolInstanceId)
    return {
      pass: false,
      detail: `tokenPool: got ${tar.tokenPool?.poolInstanceId ?? '(none)'}, want ${poolInstanceId}`,
    }
  return { pass: true, detail: `admin=${tar.admin}, tokenPool=${tar.tokenPool.poolInstanceId}` }
})

await check(`Remote chain ${selector} wired`, async () => {
  const state = await getPool()
  const lane = state.remoteChainConfigs.find((c) => c.remoteChainSelector === selector)
  if (!lane) return { pass: false, detail: `no remoteChainConfigs entry for ${selector}` }
  const bad: string[] = []
  const wantTokenAddress = process.env['CANTON_REMOTE_TOKEN_ADDRESS']
  if (wantTokenAddress && lane.remoteTokenAddress !== normalizeRemoteAddress(wantTokenAddress))
    bad.push(
      `remoteTokenAddress: got ${lane.remoteTokenAddress}, want ${normalizeRemoteAddress(wantTokenAddress)}`,
    )
  const wantPoolsRaw = process.env['CANTON_REMOTE_POOLS']
  if (wantPoolsRaw) {
    const wantPools = wantPoolsRaw.split(',').map((s) => normalizeRemoteAddress(s.trim()))
    if (JSON.stringify(lane.remotePools) !== JSON.stringify(wantPools))
      bad.push(
        `remotePools: got ${JSON.stringify(lane.remotePools)}, want ${JSON.stringify(wantPools)}`,
      )
  }
  return bad.length === 0
    ? {
        pass: true,
        detail: `remotePools=${JSON.stringify(lane.remotePools)}, remoteTokenAddress=${lane.remoteTokenAddress}`,
      }
    : { pass: false, detail: bad.join('; ') }
})

// Token-only transfers ignore the receiver's requiredCCVs — the pool's lane
// CCVs are the entire execute-time requirement, so they must be non-empty.
await check('Lane CCVs mandated', async () => {
  const lane = (await getPool()).remoteChainConfigs.find((c) => c.remoteChainSelector === selector)
  if (!lane) return { pass: false, detail: `no remoteChainConfigs entry for ${selector}` }
  const bad: string[] = []
  if (lane.inboundCCVs.length === 0) bad.push('inboundCCVs empty (falls back to lane defaults)')
  if (lane.outboundCCVs.length === 0) bad.push('outboundCCVs empty (falls back to lane defaults)')
  for (const c of ccvs) {
    if (!lane.inboundCCVs.includes(c)) bad.push(`inboundCCVs missing ${c}`)
    if (!lane.outboundCCVs.includes(c)) bad.push(`outboundCCVs missing ${c}`)
  }
  return bad.length === 0
    ? {
        pass: true,
        detail: `inbound=${JSON.stringify(lane.inboundCCVs)}, outbound=${JSON.stringify(lane.outboundCCVs)}`,
      }
    : { pass: false, detail: bad.join('; ') }
})

await check('Lane references the deployed rate limiters', async () => {
  const lane = (await getPool()).remoteChainConfigs.find((c) => c.remoteChainSelector === selector)
  if (!lane) return { pass: false, detail: `no remoteChainConfigs entry for ${selector}` }
  const bad: string[] = []
  if (lane.inboundRateLimiter !== rlIn)
    bad.push(`inbound: got ${lane.inboundRateLimiter}, want ${rlIn}`)
  if (lane.outboundRateLimiter !== rlOut)
    bad.push(`outbound: got ${lane.outboundRateLimiter}, want ${rlOut}`)
  if (lane.inboundCustomBlockConfirmationsRateLimiter !== rlInCustom)
    bad.push(
      `inboundCustomFinality: got ${lane.inboundCustomBlockConfirmationsRateLimiter}, want ${rlInCustom}`,
    )
  return bad.length === 0
    ? { pass: true, detail: 'all 3 limiter references match' }
    : { pass: false, detail: bad.join('; ') }
})

// Without these, the pool's LockOrBurn/ReleaseFromTicket aborts on-ledger.
await check('Token factories wired in TAR', async () => {
  const tar = await getTar()
  // Older TAR deployments predate the factory fields — nothing to check there.
  if (!tar.factoryFieldsSupported) {
    return { pass: true, detail: 'skipped (deployed TAR version predates factory fields)' }
  }
  const missing: string[] = []
  if (!tar.burnMintFactorySet) missing.push('burnMintFactory')
  if (!tar.transferFactorySet) missing.push('transferFactory')
  return missing.length === 0
    ? { pass: true, detail: 'burnMintFactory + transferFactory set' }
    : { pass: false, detail: `not set: ${missing.join(', ')}` }
})

for (const [label, addr] of [
  ['inbound rate limiter', rlIn],
  ['outbound rate limiter', rlOut],
  ['inbound-custom-finality rate limiter', rlInCustom],
] as const) {
  await check(`${label} deployed and enabled`, async () => {
    const rl = await manager.getRateLimiterState({
      rateLimiterInstanceAddress: addr,
      poolOwner: owner,
    })
    const bad: string[] = []
    if (!rl.isEnabled) bad.push('not enabled')
    if (rl.capacity !== wantCapacity) bad.push(`capacity: got ${rl.capacity}, want ${wantCapacity}`)
    if (rl.rate !== wantRate) bad.push(`rate: got ${rl.rate}, want ${wantRate}`)
    return bad.length === 0
      ? { pass: true, detail: `capacity=${rl.capacity}, rate=${rl.rate}, enabled=${rl.isEnabled}` }
      : { pass: false, detail: bad.join('; ') }
  })
}

console.error(failures === 0 ? '\n✓ All 9 checks passed' : `\n✗ ${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
