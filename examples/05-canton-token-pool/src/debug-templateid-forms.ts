/**
 * Probe: which templateId identifier forms does the wallet gateway's ACS
 * query accept? Tries concrete package ID vs symbolic package-name ref.
 *
 * Usage: npx tsx src/debug-templateid-forms.ts
 */
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

const MOD = 'Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval'
const forms: Record<string, string> = {
  'concrete (creating pkg 0.8.2)': `2293eb12e82ceaeb3ff7f8fe3346dece8578e1e9fd7d46624aeb7bb07fa31eda:${MOD}`,
  'concrete (preferred 0.9.2)': `1eddd268bdd50d6e262722bea799c9455da032b3f94489e589975151b274b8c0:${MOD}`,
  'symbolic name': `#utility-registry-app-v0:${MOD}`,
}

for (const [label, templateId] of Object.entries(forms)) {
  try {
    const res = await chain.provider.getActiveContracts({
      activeAtOffset: offset,
      eventFormat: {
        filtersByParty: {
          [owner]: {
            cumulative: [
              { identifierFilter: { TemplateFilter: { value: { templateId, includeCreatedEventBlob: true } } } },
            ],
          },
        },
        verbose: true,
      },
    })
    let n = 0
    for (const r of res) n++
    console.error(`${label}: OK, ${n} contract(s)`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`${label}: FAIL — ${msg.slice(0, 180)}`)
  }
}
