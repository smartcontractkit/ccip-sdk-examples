# Browser end-to-end tests

Drives the deployed example apps in a real Chromium against live testnet, with a wallet
that signs for real.

## Why it exists

These checks cover what typecheck and `vite build` cannot:

- **The production CSP.** `serve dist` and `vite preview` both ignore `vercel.json`, so
  the security headers and SPA rewrites are absent locally. Two blocked resources were
  only visible once the real CSP was applied.
- **The wallet path.** A compiling bundle does not prove that a connect handshake, a fee
  quote or a send works.
- **The rendered page.** Layout, disabled states and error text exist only in a browser.

## Setup

```bash
cp e2e/.env.example e2e/.env      # then add funded testnet keys
pnpm install
pnpm build:site                   # the suite tests dist/, so build it first
pnpm -F e2e exec playwright install chromium
```

The fixtures build all three wallets up front, so a Solana keypair and an Aptos key are
required even to run the EVM-only specs. Set in `e2e/.env`:

- `CCIP_E2E_PRIVATE_KEY` — the EVM key.
- `SVM_PRIVATE_KEY` — path to a `solana-keygen` JSON. Defaults to `~/.config/solana/id.json`.
- `APTOS_PRIVATE_KEY`, or `APTOS_CONFIG_PATH` plus `APTOS_PROFILE` to read one from an
  `aptos init` config.
- `RPC_SOLANA_DEVNET` and the other `RPC_*` overrides, optional; public endpoints are the
  fallback and are rate limited.

Playwright's bundled Chromium is unsupported on macOS 13 (`Playwright does not support
chromium on mac13`). Use the installed Google Chrome there:

```bash
CCIP_E2E_BROWSER_CHANNEL=chrome pnpm -F e2e test
```

## Running

```bash
pnpm -F e2e test          # skips the specs that spend funds
pnpm -F e2e test:headed   # same, in a visible window
pnpm -F e2e test:ui       # Playwright's interactive runner
pnpm -F e2e report        # open the HTML report after a run
pnpm -F e2e serve         # the server alone, with production headers
```

Screenshots land in `e2e/screenshots/` (gitignored, overwritten each run).

## Spending real funds

The wallets refuse to sign unless `CCIP_E2E_ALLOW_SEND=1`. To run one spending spec:

```bash
CCIP_E2E_ALLOW_SEND=1 pnpm -F e2e test -g "sends a CCIP transfer"
```

It bridges 0.001 CCIP-BnM Sepolia to Base Sepolia and prints the transaction hash.

`wallet.spec.ts` skips itself without the opt-in. `full-flow.spec.ts` does not: it sends
on all five lane directions and fails without it. Run it deliberately.

## How the wallet works

`src/wallet/evm.ts` installs an EIP-1193 provider on the page, announced over EIP-6963 so
RainbowKit lists it. The private key never enters the browser: `window.ethereum.request`
forwards to a Playwright binding and all signing happens in Node with viem, so the key
stays out of the page context, out of heap snapshots and out of trace artefacts.

Reads are proxied to the same testnet RPCs the apps use, so balances, fees and lane config
are live rather than mocked. No extension, no fork, no seed phrase to manage.

Two things to know if you extend it:

- The announced `rdns` must not be a real wallet's. Announcing as `io.metamask` makes
  RainbowKit merge the provider into its MetaMask entry and run the extension handshake,
  which never completes because there is no extension.
- Every UI here renders a truncated address (`0x1a2b…9f0e`), so assert on the last four
  characters. A leading slice fails even when the connection succeeded.

## Console errors

`KNOWN_CONSOLE_ERRORS` in `src/fixtures.ts` lists the errors that are accepted, each with
a reason. The suite asserts nothing outside that list appears, so a new error fails the
run instead of scrolling past in a log.

Only WalletConnect is on it, and only when `VITE_WALLETCONNECT_PROJECT_ID` is unset at
build time. The Google Fonts and Google Analytics entries stay as regression guards: both
are fixed at the source, and `site.spec.ts` asserts neither request is made at all.

## Not covered

- **Solana and Aptos as a fee-token source.** The fee-token radio group is only exercised
  on EVM lanes.
- **WalletConnect.** Needs `VITE_WALLETCONNECT_PROJECT_ID` at build time; without it the
  entry appears in the modal but offers no QR. Injected wallets are unaffected.
- **Successful destination execution.** A send is asserted to reach the source chain; delivery
  of a successful message is not waited on. A failed message's destination state and decoded
  revert are covered, in `failed-message.spec.ts`.
