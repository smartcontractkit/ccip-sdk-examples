/**
 * CCIP SDK Example: send a message (or a token transfer) from Canton to an EVM chain.
 *
 * Dry-run by default: builds the send command and prints it, submits nothing.
 * Set CANTON_SEND_CONFIRM=1 to submit it.
 *
 * Usage:
 *   pnpm send-canton-to-evm
 *
 * Env (required): CANTON_GATEWAY_URL, CANTON_GATEWAY_ACCESS_TOKEN,
 *      CANTON_SEND_RECEIVER (EVM address, 0x…).
 * Optional:
 *   CANTON_SEND_DEST_SELECTOR  destination chain selector (default: Sepolia, 16015286601757825753)
 *   CANTON_SEND_TOKEN          Canton instrument to transfer, `tokenId@adminParty` (omit = message only)
 *   CANTON_SEND_AMOUNT         decimal amount of that token (default 1.0; Canton tokens use 10 decimals)
 *   CANTON_SEND_DATA           0x… payload (omit = none)
 *   CANTON_SEND_COMMAND_ID     idempotency key: reuse it to retry a send whose outcome is unknown,
 *                              a repeat is then rejected as DUPLICATE_COMMAND instead of sending twice;
 *                              use a NEW one for every distinct message
 *   CANTON_CCVS                comma-separated CCVs (`instanceId@party`) for the send
 *   CANTON_CHAIN_ID            default canton:TestNet
 */
import 'dotenv/config'

import { CantonChain } from '@chainlink/ccip-sdk'
import { getCantonNetworkConfig } from '@chainlink/ccip-sdk/cct/canton'
import { parseUnits } from 'ethers'

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

const CANTON_DECIMALS = 10
const gatewayUrl = requireEnv('CANTON_GATEWAY_URL')
const accessToken = requireEnv('CANTON_GATEWAY_ACCESS_TOKEN')
const receiver = requireEnv('CANTON_SEND_RECEIVER')
const destChainSelector = BigInt(process.env['CANTON_SEND_DEST_SELECTOR'] ?? '16015286601757825753')
const token = process.env['CANTON_SEND_TOKEN']
const amount = parseUnits(process.env['CANTON_SEND_AMOUNT'] ?? '1.0', CANTON_DECIMALS)
const data = process.env['CANTON_SEND_DATA']
const commandId = process.env['CANTON_SEND_COMMAND_ID']
const ccvRawAddresses = process.env['CANTON_CCVS']?.split(',').map((s) => s.trim()).filter(Boolean)
const confirm = process.env['CANTON_SEND_CONFIRM'] === '1'

const chainId = process.env['CANTON_CHAIN_ID'] ?? 'canton:TestNet'
const network = getCantonNetworkConfig(chainId)
if (!network) throw new Error(`no well-known config for ${chainId}`)
if (!network.edsUrl) throw new Error(`No EDS URL for ${chainId} — this network needs an explicit one`)

const owner = process.env['CANTON_POOL_OWNER'] || (await fetchGatewayPrimaryParty({ gatewayUrl, accessToken }))
await ensureGatewaySession({ gatewayUrl, accessToken, networkId: 'canton:chainlink-testnet' })

const chain = await CantonChain.fromProvider(
  createGatewayCantonProvider({ gatewayUrl, accessToken, networkId: chainId, partyId: owner }),
  {
    cantonConfig: {
      ccipParty: network.ccipOwner,
      externalEdsUrlsByOwner: { '*': network.edsUrl },
    },
  },
)

const message = {
  receiver,
  ...(data ? { data } : {}),
  ...(token ? { tokenAmounts: [{ token, amount }] } : {}),
  // Only set the fields you use; the send falls back to its defaults for the rest.
  extraArgs: {
    ...(commandId ? { commandId } : {}),
    ...(ccvRawAddresses?.length ? { ccvRawAddresses } : {}),
  },
}

console.log(`Sender (active party): ${chain.activeParty}`)
console.log(`Destination selector:  ${destChainSelector}`)
console.log(`Receiver:              ${receiver}`)
if (token) console.log(`Token transfer:        ${token} = ${process.env['CANTON_SEND_AMOUNT'] ?? '1.0'}`)
console.log(`commandId:             ${commandId ?? '(generated; not safe to retry blindly)'}`)

// Dry-run: build the command only. Nothing is submitted.
const unsigned = await chain.generateUnsignedSendMessage({
  sender: chain.activeParty,
  router: '', // unused on Canton
  destChainSelector,
  message,
} as Parameters<CantonChain['generateUnsignedSendMessage']>[0])
console.log(`\nBuilt send command, commandId = ${unsigned.commands.commandId}`)

if (!confirm) {
  console.log('\nDry run only. Set CANTON_SEND_CONFIRM=1 to submit.')
  process.exit(0)
}

const request = await chain.sendMessage({
  router: '', // unused on Canton
  destChainSelector,
  message,
  wallet: undefined, // signing is handled by the provider
} as Parameters<CantonChain['sendMessage']>[0])
console.log(`\nSent. Message ID: ${request.message.messageId}`)
console.log(`Tx: ${request.tx.hash}`)
