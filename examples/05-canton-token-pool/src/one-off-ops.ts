/**
 * CCIP SDK Example: exercise the one-off Canton pool / rate-limiter ops.
 *
 * Each subcommand builds an unsigned transaction, submits it via the wallet
 * gateway (approve in the browser, then press Enter), and reads the state
 * back to verify. Offline checks (no submission) are marked [offline].
 *
 * Usage:
 *   pnpm ops <subcommand>
 *
 * Subcommands:
 *   set-rate-limit-admin    set rateLimitAdmin to OPS_RATE_LIMIT_ADMIN, read back
 *   clear-rate-limit-admin  clear rateLimitAdmin, read back
 *   set-rate-limit          retune a limiter (OPS_LIMITER=in|out|custom, OPS_RL_CAPACITY, OPS_RL_RATE)
 *   block-lane              set a limiter to enabled+0/0 (blocks that direction!)
 *   unblock-lane            restore the limiter from CANTON_RL_CAPACITY/CANTON_RL_RATE
 *   set-timeout             set transfer timeout to OPS_TIMEOUT_HOURS hours
 *   set-observers           set pool observers to CANTON_OBSERVERS (+OPS_EXTRA_OBSERVER)
 *   limiter-observers       set a limiter's own observers to CANTON_OBSERVERS
 *   fee-config-set          set the lane's token transfer fee config (feeBps=OPS_FEE_BPS ?? 1)
 *   fee-config-disable      disable the lane's fee config
 *   set-pool-metadata       [lock-release] set holdings labels (OPS_META_KEY/OPS_META_VALUE,
 *                           default cip-112/receiver.id=ccip-public)
 *   ctx-add                 add scalar context entry OPS_CTX_KEY=OPS_CTX_VALUE
 *   ctx-add-contract        add contract context entry OPS_CTX_KEY=OPS_CTX_CONTRACT
 *   ctx-remove              remove OPS_CTX_KEY
 *   ctx-clear               clear all context entries
 *   reapply-lane            remove + re-add the lane from .env in one tx
 *   command-id-stability    [offline] same params → identical commandId twice
 *   reject-bad-timeout      [offline] deploy with RelativeHours -1 must fail validation
 */
import 'dotenv/config'
import * as readline from 'node:readline'

import { CantonTokenManager, getCantonNetworkConfig, decodeDamlRecord, extractFieldValue, POOL_TEMPLATE_IDS } from '@chainlink/ccip-sdk/cct/canton'
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
if (!network?.ledgerUrl) throw new Error(`no ledger URL for ${chainId}`)

const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))
const instrumentIdRaw = requireEnv('CANTON_INSTRUMENT_ID')
const poolInstanceId = process.env['CANTON_POOL_INSTANCE_ID'] || `${instrumentIdRaw.toLowerCase()}-pool-001`
const poolInstanceAddress = `${poolInstanceId}@${owner}`
const selector = BigInt(requireEnv('CANTON_REMOTE_CHAIN_SELECTOR'))
const decimals = Number(process.env['CANTON_DECIMALS'] ?? '10')
const scale = 10n ** BigInt(decimals)
const observers = requireEnv('CANTON_OBSERVERS').split(',').map((s) => s.trim())

const limiterAddress = (which: string) =>
  `${poolInstanceId}-rl-${which === 'custom' ? 'in-custom' : which}-${selector}@${owner}`

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
const manager = CantonTokenManager.fromChain(chain)

async function submitAndConfirm(label: string, unsigned: { commands: unknown }) {
  const { approveUrl } = await submitViaGateway({
    gatewayUrl,
    accessToken,
    unsigned: unsigned as never,
  })
  console.error(`Approve ${label} at:`, approveUrl)
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  await new Promise<void>((r) =>
    rl.question('press Enter after approving… ', () => {
      rl.close()
      r()
    }),
  )
}

const getPool = () => manager.getTokenPoolState({ poolInstanceAddress, poolOwner: owner })
const getLimiter = (which: string) =>
  manager.getRateLimiterState({
    rateLimiterInstanceAddress: limiterAddress(which),
    poolOwner: owner,
  })

const op = process.argv[2]
const which = process.env['OPS_LIMITER'] ?? 'out'

switch (op) {
  case 'set-rate-limit-admin': {
    const admin = requireEnv('OPS_RATE_LIMIT_ADMIN')
    await submitAndConfirm(
      'setDynamicConfig',
      await manager.generateUnsignedSetDynamicConfig({ poolInstanceAddress, rateLimitAdmin: admin, sender: owner }),
    )
    const pool = await getPool()
    console.error(`rateLimitAdmin now: ${pool.rateLimitAdmin} ${pool.rateLimitAdmin === admin ? '✓' : '✗'}`)
    break
  }

  case 'clear-rate-limit-admin': {
    await submitAndConfirm(
      'setDynamicConfig(null)',
      await manager.generateUnsignedSetDynamicConfig({ poolInstanceAddress, rateLimitAdmin: null, sender: owner }),
    )
    const pool = await getPool()
    console.error(`rateLimitAdmin now: ${pool.rateLimitAdmin} ${pool.rateLimitAdmin === undefined ? '✓ (cleared)' : '✗'}`)
    break
  }

  case 'set-rate-limit':
  case 'unblock-lane': {
    const capacity = BigInt(requireEnv('OPS_RL_CAPACITY')) * scale
    const rate = BigInt(requireEnv('OPS_RL_RATE')) * scale
    await submitAndConfirm(
      `setRateLimitConfig(${which})`,
      await manager.generateUnsignedSetRateLimitConfig({
        poolInstanceAddress,
        rateLimiterInstanceAddress: limiterAddress(which),
        isEnabled: true,
        capacity,
        rate,
        sender: owner,
      }),
    )
    const rl = await getLimiter(which)
    console.error(`limiter ${which}: enabled=${rl.isEnabled} capacity=${rl.capacity} rate=${rl.rate} ${rl.capacity === capacity.toString() && rl.rate === rate.toString() ? '✓' : '✗'}`)
    break
  }

  case 'block-lane': {
    console.error(`⚠ blocking the ${which} direction (enabled, 0 capacity, 0 rate) — in-flight transfers may stall`)
    await submitAndConfirm(
      `setRateLimitConfig(${which}, 0/0)`,
      await manager.generateUnsignedSetRateLimitConfig({
        poolInstanceAddress,
        rateLimiterInstanceAddress: limiterAddress(which),
        isEnabled: true,
        capacity: 0n,
        rate: 0n,
        sender: owner,
      }),
    )
    const rl = await getLimiter(which)
    console.error(`limiter ${which}: enabled=${rl.isEnabled} capacity=${rl.capacity} rate=${rl.rate} ${rl.isEnabled && rl.capacity === '0' ? '✓ blocked' : '✗'}`)
    break
  }

  case 'set-timeout': {
    const hours = Number(requireEnv('OPS_TIMEOUT_HOURS'))
    await submitAndConfirm(
      'setTransferTimeout',
      await manager.generateUnsignedSetTransferTimeout({
        poolInstanceAddress,
        transferTimeout: { type: 'RelativeHours', hours },
        sender: owner,
      }),
    )
    // getTokenPoolState doesn't surface transferTimeout — success = no error on submit
    console.error(`✓ setTransferTimeout(${hours}h) submitted`)
    break
  }

  case 'set-observers': {
    const extra = process.env['OPS_EXTRA_OBSERVER']
    const next = extra ? [...observers, extra] : observers
    await submitAndConfirm(
      'setObservers',
      await manager.generateUnsignedSetObservers({ poolInstanceAddress, observers: next, sender: owner }),
    )
    const pool = await getPool()
    console.error(`observers now: ${JSON.stringify(pool.observers)} ✓ (submitted ${next.length})`)
    break
  }

  case 'limiter-observers': {
    await submitAndConfirm(
      `setRateLimiterObservers(${which})`,
      await manager.generateUnsignedSetRateLimiterObservers({
        rateLimiterInstanceAddress: limiterAddress(which),
        observers,
        sender: owner,
      }),
    )
    const rl = await getLimiter(which)
    console.error(`limiter ${which} observers: ${JSON.stringify(rl.observers)} ✓`)
    break
  }

  case 'fee-config-set': {
    const feeBps = BigInt(process.env['OPS_FEE_BPS'] ?? '1')
    await submitAndConfirm(
      'applyTokenTransferFeeConfigUpdates(set)',
      await manager.generateUnsignedApplyTokenTransferFeeConfigUpdates({
        poolInstanceAddress,
        tokenTransferFeeConfigArgs: [
          { destChainSelector: selector, destGasOverhead: 0, destBytesOverhead: 0, feeUSDCents: 0n, feeBps },
        ],
        sender: owner,
      }),
    )
    console.error('✓ fee config submitted (feeBps=' + feeBps + ')')
    break
  }

  case 'fee-config-disable': {
    await submitAndConfirm(
      'applyTokenTransferFeeConfigUpdates(disable)',
      await manager.generateUnsignedApplyTokenTransferFeeConfigUpdates({
        poolInstanceAddress,
        disableTokenTransferFeeConfigArgs: [selector],
        sender: owner,
      }),
    )
    console.error('✓ fee config disabled')
    break
  }

  case 'set-pool-metadata': {
    // LR pools: labels stamped on lockbox holdings (DA disclosure filter).
    const key = process.env['OPS_META_KEY'] ?? 'cip-112/receiver.id'
    const value = process.env['OPS_META_VALUE'] ?? 'ccip-public'
    await submitAndConfirm(
      'setPoolReceiveMetadata',
      await manager.generateUnsignedSetPoolReceiveMetadata({
        poolInstanceAddress,
        metadata: { [key]: value },
        sender: owner,
      }),
    )
    console.error(`✓ poolReceiveMetadata set: ${key}=${value}`)
    break
  }

  case 'ctx-add': {
    const key = requireEnv('OPS_CTX_KEY')
    const value = requireEnv('OPS_CTX_VALUE')
    await submitAndConfirm(
      'addPoolReceiveContextValue',
      await manager.generateUnsignedAddPoolReceiveContextValue({
        poolInstanceAddress,
        contextKey: key,
        value,
        sender: owner,
      }),
    )
    console.error(`✓ context ${key}=${value} added`)
    break
  }

  case 'ctx-add-contract': {
    const key = requireEnv('OPS_CTX_KEY')
    const cid = requireEnv('OPS_CTX_CONTRACT')
    await submitAndConfirm(
      'addPoolReceiveContextContractValue',
      await manager.generateUnsignedAddPoolReceiveContextContractValue({
        poolInstanceAddress,
        contextKey: key,
        referredContract: cid,
        sender: owner,
      }),
    )
    console.error(`✓ context ${key}=${cid} added`)
    break
  }

  case 'ctx-remove': {
    const key = requireEnv('OPS_CTX_KEY')
    await submitAndConfirm(
      'removePoolReceiveContextValue',
      await manager.generateUnsignedRemovePoolReceiveContextValue({
        poolInstanceAddress,
        contextKey: key,
        sender: owner,
      }),
    )
    console.error(`✓ context ${key} removed`)
    break
  }

  case 'ctx-clear': {
    await submitAndConfirm(
      'clearPoolReceiveContext',
      await manager.generateUnsignedClearPoolReceiveContext({ poolInstanceAddress, sender: owner }),
    )
    console.error('✓ context cleared')
    break
  }

  case 'reapply-lane': {
    // The remove + re-add-in-one-tx reconfigure pattern.
    // OPS_FINALITY: 'finality' (default) | 'safe' | 'depth:N' — FTF modes need
    // the lane's custom-finality limiter, which deploy always creates.
    const f = process.env['OPS_FINALITY'] ?? 'finality'
    const finalityConfig = f.startsWith('depth:')
      ? { type: 'BlockDepth' as const, blockConfirmations: Number(f.slice(6)) }
      : f === 'safe'
        ? { type: 'WaitForSafe' as const }
        : { type: 'WaitForFinality' as const }
    const lane = {
      remoteChainSelector: selector,
      remotePools: requireEnv('CANTON_REMOTE_POOLS').split(','),
      remoteTokenAddress: requireEnv('CANTON_REMOTE_TOKEN_ADDRESS'),
      inboundCCVs: requireEnv('CANTON_CCV').split(','),
      outboundCCVs: requireEnv('CANTON_CCV').split(','),
      finalityConfig,
      inboundRateLimiter: limiterAddress('in'),
      inboundCustomBlockConfirmationsRateLimiter: limiterAddress('custom'),
      outboundRateLimiter: limiterAddress('out'),
    }
    await submitAndConfirm(
      'applyChainUpdates(remove+re-add)',
      await manager.generateUnsignedApplyChainUpdates({
        poolInstanceAddress,
        remoteChainSelectorsToRemove: [selector],
        chainsToAdd: [lane],
        sender: owner,
      }),
    )
    const pool = await getPool()
    const found = pool.remoteChainConfigs.find((c) => c.remoteChainSelector === selector.toString())
    console.error(`lane ${selector}: ${found ? 'present ✓' : 'MISSING ✗'} finality=${JSON.stringify(found?.finalityConfig)}`)
    break
  }

  case 'archive-pool': {
    // Retire the pool contract (default Archive choice, controller = pool owner).
    // Holdings (owned by the pool owner party) are unaffected; the instance
    // address is freed for a redeploy with the same instanceId.
    const poolType = process.env['CANTON_POOL_TYPE'] === 'burnMint' ? 'burnMint' : 'lockRelease'
    const [instanceId] = poolInstanceAddress.split('@')
    const matches = await chain.findActiveContractsByTemplate(
      POOL_TEMPLATE_IDS[poolType],
      [owner],
      (args) => extractFieldValue(decodeDamlRecord(args)['instanceId']) === instanceId,
    )
    const pool = matches.sort((a, b) => (b.createdAtOffset ?? 0) - (a.createdAtOffset ?? 0))[0]
    if (!pool) throw new Error(`no active ${entity} for ${poolInstanceAddress}`)
    await submitAndConfirm('archivePool', {
      commands: {
        commands: [
          {
            ExerciseCommand: {
              templateId: pool.templateId,
              contractId: pool.contractId,
              choice: 'Archive',
              choiceArgument: {},
            },
          },
        ],
        commandId: `cct-archive-pool-${crypto.randomUUID()}`,
        actAs: [owner],
      },
    })
    console.error(`pool ${poolInstanceAddress} archived ✓ (instance address freed)`)
    break
  }

  case 'command-id-stability': {
    // [offline] identical params must produce identical command IDs (dedup safety)
    const params = { poolInstanceAddress, observers, sender: owner }
    const [a, b] = await Promise.all([
      manager.generateUnsignedSetObservers({ ...params }),
      manager.generateUnsignedSetObservers({ ...params }),
    ])
    console.error('commandId 1:', a.commands.commandId)
    console.error('commandId 2:', b.commands.commandId)
    console.error(a.commands.commandId === b.commands.commandId ? '✓ deterministic' : '✗ MISMATCH')
    break
  }

  case 'reject-bad-timeout': {
    // [offline] a negative RelativeHours must be rejected before any RPC
    try {
      await manager.generateUnsignedDeployTokenPool({
        poolType: 'burnMint',
        instanceId: 'should-not-build',
        instrumentId: { admin: owner, id: instrumentIdRaw },
        decimals,
        observers,
        lanes: [],
        transferTimeout: { type: 'RelativeHours', hours: -1 },
        sender: owner,
      })
      console.error('✗ negative timeout was NOT rejected')
    } catch (err) {
      console.error(`✓ rejected: ${err instanceof Error ? err.message : err}`)
    }
    break
  }

  default:
    console.error(`unknown subcommand "${op}" — see the header comment for the list`)
    process.exitCode = 1
}
