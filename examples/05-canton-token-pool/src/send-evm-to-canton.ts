/**
 * CCIP SDK Example: send a token-only transfer from Sepolia to Canton,
 * exercising the Canton pool's release path (LockOrBurn on EVM → CCV verify →
 * TokenReceiveTicket → ReleaseFromTicket on Canton).
 *
 * Usage: pnpm send-evm-to-canton
 *
 * Env: EVM_RPC_URL, EVM_TOKEN_ADDRESS, EVM_CANTON_RECEIVER_PARTY (Canton party
 *      id of the receiver, e.g. u_…::1220…), EVM_AMOUNT (decimal, default 0.1).
 * Optional: EVM_PRIVATE_KEY (unset = dry-run: prints message + fee only),
 *      EVM_ROUTER_ADDRESS (default: Sepolia CCIP Router),
 *      EVM_DEST_CHAIN_SELECTOR (default: Canton TestNet selector).
 */
import 'dotenv/config'

import { Contract, JsonRpcProvider, Wallet, formatUnits, getAddress, id as keccak256Utf8, parseUnits } from 'ethers'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required env var ${name}`)
  return value
}

const rpcUrl = requireEnv('EVM_RPC_URL')
const tokenAddress = requireEnv('EVM_TOKEN_ADDRESS')
const receiverParty = requireEnv('EVM_CANTON_RECEIVER_PARTY')
const amountStr = process.env['EVM_AMOUNT'] ?? '0.1'
// v1.2 Sepolia router — the one with the Canton destination lane (the v2.0
// router 0x784d… returns the zero address for getOnRamp(Canton)).
const routerAddress = getAddress(process.env['EVM_ROUTER_ADDRESS'] ?? '0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59')
const destChainSelector = BigInt(process.env['EVM_DEST_CHAIN_SELECTOR'] ?? '9268731218649498074')

// Canton CCIP receivers are addressed as keccak256(partyId) — same encoding as
// HashedPartyFromString in chainlink-canton and the SDK's Canton party handling.
const receiverAddress = keccak256Utf8(receiverParty)

const ROUTER_ABI = [
  'function getFee(uint64 destinationChainSelector, (bytes receiver, bytes data, (address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) view returns (uint256)',
  'function ccipSend(uint64 destinationChainSelector, (bytes receiver, bytes data, (address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) payable returns (bytes32)',
  'event CCIPSendRequested(bytes32 indexed messageId, (address sender, uint64 sequence, uint64 destinationChainSelector, bool isBatch, (bytes receiver, bytes data, (address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message))',
]
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]

const provider = new JsonRpcProvider(rpcUrl)
const token = new Contract(tokenAddress, ERC20_ABI, provider)
const router = new Contract(routerAddress, ROUTER_ABI, provider)

const decimals = Number(await token.decimals!())
const amount = parseUnits(amountStr, decimals)

// Token-only transfer: no data (no receiver contract execution on Canton —
// the PerPartyRouter resolves the receiver party from the address).
//
// GenericExtraArgsV3 (ExtraArgsCodec.sol) — the v1.2 router's Canton lane
// rejects the legacy V1 tag at getFee:
//   tag(4) | uint32 gasLimit | uint16 blockConfirmations (0 = full finality)
//   | uint8 ccvsLength | uint8 executorLength | uint16 executorArgsLength
//   | uint8 tokenReceiverLength | uint16 tokenArgsLength
const gasLimit = Number(process.env['EVM_GAS_LIMIT'] ?? '200000')
const extraArgs =
  '0xa69dd4aa' +
  gasLimit.toString(16).padStart(8, '0') +
  (0).toString(16).padStart(4, '0') +
  '00' +
  '00' +
  '0000' +
  '00' +
  '0000'

const message = {
  receiver: receiverAddress,
  data: '0x',
  tokenAmounts: [{ token: tokenAddress, amount }],
  feeToken: '0x0000000000000000000000000000000000000000', // native fee
  extraArgs,
}

console.error(`EVM → Canton token send`)
console.error(`  token:            ${tokenAddress} (${amountStr} / ${decimals} dp)`)
console.error(`  destChainSelector ${destChainSelector}`)
console.error(`  receiver party:   ${receiverParty}`)
console.error(`  receiver address: ${receiverAddress}`)
console.error(`  router:           ${routerAddress}`)

const fee = await router.getFee!(destChainSelector, message)
console.error(`  fee (native):     ${formatUnits(fee, 18)}`)

const privateKey = process.env['EVM_PRIVATE_KEY']
if (!privateKey) {
  console.error('\ndry-run (EVM_PRIVATE_KEY unset) — message + fee shown above')
  process.exit(0)
}

const wallet = new Wallet(privateKey, provider)
const tokenWithSigner = token.connect(wallet) as typeof token
const routerWithSigner = router.connect(wallet) as typeof router

const allowance: bigint = await tokenWithSigner.allowance!(wallet.address, routerAddress)
if (allowance < amount) {
  console.error(`  approving router for ${amountStr}…`)
  await (await tokenWithSigner.approve!(routerAddress, amount)).wait()
  console.error(`  ✓ approved`)
}

console.error(`  sending…`)
const tx = await routerWithSigner.ccipSend!(destChainSelector, message, { value: fee })
const rcpt = await tx.wait()
console.error(`  ✓ submitted in tx ${tx.hash} (block ${rcpt?.blockNumber})`)

const ev = rcpt?.logs
  .map((l: { topics: string[]; data: string }) => {
    try {
      return router.interface.parseLog({ topics: l.topics, data: l.data })
    } catch {
      return null
    }
  })
  .find((e: { name?: string } | null) => e?.name === 'CCIPSendRequested')
if (ev) {
  console.error(`\n✅ MessageID: ${ev.args['messageId']}`)
  console.error(`   sequence: ${ev.args['message']['sequence']}`)
} else {
  console.error('\n✅ sent (CCIPSendRequested event not found — check the tx on the explorer)')
}
console.error(`\nNext: on Canton, execute via the CCV/executor path, then check the receiver's holdings.`)
