# CCIP SDK Examples

[![CI](https://github.com/smartcontractkit/ccip-sdk-examples/actions/workflows/ci.yml/badge.svg)](https://github.com/smartcontractkit/ccip-sdk-examples/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node: >=22.0.0](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](package.json)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

Progressive examples for [@chainlink/ccip-sdk](https://www.npmjs.com/package/@chainlink/ccip-sdk). Testnet only. EVM, Solana, and Aptos.

> **Disclaimer**
>
> This repository is for education and integration examples. Code is provided "AS IS" without warranty. It has not been audited. Do not use in production without your own review and hardening. See [LICENSE](LICENSE).

## Examples

| Example                                                           | Description                                                                                                                                                                                                                                 | Runtime |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [01-getting-started](./examples/01-getting-started)               | SDK basics: chains, fees, tokens, pools                                                                                                                                                                                                     | Node.js |
| [02-evm-simple-bridge](./examples/02-evm-simple-bridge)           | EVM-to-EVM bridge; fee token selection (native/LINK); **send:** `chain.sendMessage()` (SDK does approval + send)                                                                                                                            | Browser |
| [03-multichain-bridge-dapp](./examples/03-multichain-bridge-dapp) | EVM + Solana + Aptos; fee token selection; **send:** `generateUnsignedSendMessage()` then wallet `sendTransaction` (unsigned tx to wallet)                                                                                                  | Browser |
| [04-hardhat-ccip](./examples/04-hardhat-ccip)                     | Hardhat v3 + custom Sender/Receiver contracts; token transfers (TT), arbitrary messaging, programmable token transfers (PTT); SDK-assisted destination gas estimation, fee quoting, extraArgs encoding, manual execution of failed messages | Node.js |

## Prerequisites

- Node.js 22+
- pnpm 10+ (`npm install -g pnpm`)

## Setup

```bash
git clone <repo-url>
cd ccip-sdk-examples
pnpm install
pnpm build:packages
```

## Run

```bash
# 00 – Landing page (dev server http://localhost:5173)
pnpm dev:00

# 01 – Node scripts (from repo root)
pnpm -F 01-getting-started chains
pnpm -F 01-getting-started fees -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1
pnpm -F 01-getting-started tokens -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1

# 02 – EVM bridge (dev server http://localhost:5173)
pnpm dev:02

# 03 – Multichain bridge (dev server http://localhost:5173)
pnpm dev:03

# 04 – Hardhat tasks (compile, test, deploy, send)
pnpm -F 04-hardhat-ccip build
pnpm -F 04-hardhat-ccip test
```

Optional: in 02 or 03, copy `.env.example` to `.env` and set `RPC_<NETWORK_ID>` (e.g. `RPC_ETHEREUM_TESTNET_SEPOLIA`) to use custom RPC endpoints. 03 also supports `VITE_WALLETCONNECT_PROJECT_ID`.

## Project structure

```
ccip-sdk-examples/
├── examples/
│   ├── 00-landing-page/     # Landing page for deployed site
│   ├── 01-getting-started/   # Node scripts
│   ├── 02-evm-simple-bridge/ # EVM-only browser app
│   ├── 03-multichain-bridge-dapp/ # EVM + Solana + Aptos browser app
│   └── 04-hardhat-ccip/     # Hardhat v3 + custom contracts
├── packages/
│   ├── shared-brand/        # Design tokens, logos, brand assets
│   ├── shared-config/       # Networks, tokens, wagmi, constants
│   ├── shared-utils/        # Validation, errors, formatting, message build, hooks
│   └── shared-components/   # Button, Input, Select, Alert, MessageProgress, TransferStatus, ErrorBoundary
├── scripts/
│   └── build-site.sh        # Assembles all browser examples into dist/
├── docs/
│   └── LEARNING_PATH.md     # Progression and concepts
├── vercel.json               # Vercel deployment config
├── pnpm-workspace.yaml
└── package.json
```

## Shared packages

### @chainlink/ccip-examples-shared-config

Network and token config; wagmi config and query client; constants (status labels, polling, explorer URLs). RPC URLs come from `getRpcUrl(networkId)` (env vars `RPC_<NETWORK_ID>` or public fallbacks).

- **Exports:** `NETWORKS`, `NETWORK_IDS`, `getNetwork`, `getEVMNetworks`, `getSolanaNetworks`, `getAptosNetworks`, `getAllNetworks`, `getChainIdForNetwork`, `getExplorerTxUrl`, `getExplorerAddressUrl`; `getTokenAddress`, `resolveFeeTokenAddress`, `TOKEN_ADDRESSES`, etc.; `ChainFamily`; `POLLING_CONFIG`, `getStatusDescription`, `getFaucetUrl`, `getDummyReceiver`, etc.
- **Subpaths:** `./wagmi`, `./queryClient`, `./networks`, `./tokens`.

### @chainlink/ccip-examples-shared-utils

Browser-safe utilities: validation (`isValidAddress`, `isValidAmount`, `parseAmount`, `formatAmount`, `truncateAddress`), CCIP error parsing (`getCCIPErrorMessage`, `parseEVMError`, `parseSolanaError`), formatting (`formatLatency`, `formatElapsedTime`, `formatRelativeTime`), message building (`buildTokenTransferMessage`), clipboard (`copyToClipboard`, `COPIED_FEEDBACK_MS`), viem adapter (`toGenericPublicClient`). Node-only wallet/chain helpers live in `@chainlink/ccip-examples-shared-utils/wallet`.

- **Subpaths:** `./hooks` (e.g. `useMessageStatus`, `useCopyToClipboard`).

### @chainlink/ccip-examples-shared-components

React UI: primitives (Button, Input, Select, Alert), bridge (MessageProgress, TransferStatus, FeeTokenOptions, BalancesList), ErrorBoundary. All use design tokens from `@chainlink/ccip-examples-shared-components/styles/tokens.css`. Import tokens once in app globals.

- **FeeTokenOptions:** Radio group for choosing fee token (native currency, LINK, or other tokens discovered from the router). Displays token name, symbol, balance, and a "Native" badge for native currency options.
- **BalancesList:** Displays multiple token balances with loading skeletons.

## Supported networks (testnet)

| Network          | Family | Chain selector (example) |
| ---------------- | ------ | ------------------------ |
| Ethereum Sepolia | EVM    | 16015286601757825753     |
| Base Sepolia     | EVM    | 10344971235874465080     |
| Avalanche Fuji   | EVM    | 14767482510784806043     |
| Solana Devnet    | Solana | 16423721717087811551     |
| Aptos Testnet    | Aptos  | 4741433654826277614      |

Faucets and test tokens: [CCIP Test Tokens](https://docs.chain.link/ccip/test-tokens), [Chainlink Faucets](https://faucets.chain.link/).

## Commands

```bash
pnpm install
pnpm build            # All packages + examples
pnpm build:packages   # Only packages
pnpm build:site       # Build combined site into dist/
pnpm preview:site     # Build + serve combined site locally
pnpm typecheck
pnpm lint
pnpm format           # Prettier write
pnpm format:check     # Prettier check (CI)
pnpm check            # typecheck + lint + format:check
```

## Deployment

All browser examples (02, 03) are deployed as a single Vercel project. A landing page at `/` links to each example, served under its directory name (`/02-evm-simple-bridge/`, `/03-multichain-bridge-dapp/`).

`scripts/build-site.sh` builds each browser example with a `VITE_BASE` path prefix, then assembles the outputs into a single `dist/` directory. `vercel.json` configures SPA rewrites so client-side routing works within each sub-app.

**Local testing:**

```bash
pnpm build:site       # Build packages + all browser examples into dist/
npx serve dist        # Serve at http://localhost:3000
```

**Vercel CLI (simulates production, including rewrites):**

```bash
npx vercel build
npx vercel dev
```

## Adding a browser example

1. Create `examples/NN-name/` with a `vite.config.ts` that reads `base: process.env.VITE_BASE || "/"`.
2. Add build and copy lines to `scripts/build-site.sh`.
3. Add a rewrite rule to `vercel.json`.
4. Add an entry to `examples/00-landing-page/src/data/examples.ts`.

Node.js-only examples (no `vite.config.ts` + `index.html`) require no deployment changes.

## License

MIT
