# CCIP SDK Examples

[![CI](https://github.com/smartcontractkit/ccip-sdk-examples/actions/workflows/ci.yml/badge.svg)](https://github.com/smartcontractkit/ccip-sdk-examples/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node: >=22.0.0](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](package.json)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

Progressive examples for [@chainlink/ccip-sdk](https://www.npmjs.com/package/@chainlink/ccip-sdk) (v1.0.0). Testnet only. EVM, Solana, and Aptos.

> **Disclaimer**
>
> This repository is for education and integration examples. Code is provided "AS IS" without warranty. It has not been audited. Do not use in production without your own review and hardening. See [LICENSE](LICENSE).

## Examples

| Example                                                           | Description                                                                                                                                | Runtime |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| [01-getting-started](./examples/01-getting-started)               | SDK basics: chains, fees, tokens, pools                                                                                                    | Node.js |
| [02-evm-simple-bridge](./examples/02-evm-simple-bridge)           | EVM-to-EVM bridge; fee token selection (native/LINK); **send:** `chain.sendMessage()` (SDK does approval + send)                           | Browser |
| [03-multichain-bridge-dapp](./examples/03-multichain-bridge-dapp) | EVM + Solana + Aptos; fee token selection; **send:** `generateUnsignedSendMessage()` then wallet `sendTransaction` (unsigned tx to wallet) | Browser |

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
# 01 – Node scripts (from repo root)
pnpm -F 01-getting-started chains
pnpm -F 01-getting-started fees -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1
pnpm -F 01-getting-started tokens -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1

# 02 – EVM bridge (dev server http://localhost:5173)
pnpm dev:02

# 03 – Multichain bridge (dev server http://localhost:5173)
pnpm dev:03
```

Optional: in 02 or 03, copy `.env.example` to `.env` and set `RPC_<NETWORK_ID>` (e.g. `RPC_ETHEREUM_TESTNET_SEPOLIA`) to use custom RPC endpoints. 03 also supports `VITE_WALLETCONNECT_PROJECT_ID`.

## Project structure

```
ccip-sdk-examples/
├── examples/
│   ├── 01-getting-started/   # Node scripts
│   ├── 02-evm-simple-bridge/ # EVM-only browser app
│   └── 03-multichain-bridge-dapp/ # EVM + Solana + Aptos browser app
├── packages/
│   ├── shared-config/       # Networks, tokens, wagmi, constants
│   ├── shared-utils/        # Validation, errors, formatting, message build, hooks
│   └── shared-components/   # Button, Input, Select, Alert, MessageProgress, TransferStatus, ErrorBoundary, tokens.css
├── docs/
│   └── LEARNING_PATH.md     # Progression and concepts
├── pnpm-workspace.yaml
└── package.json
```

## Shared packages

### @ccip-examples/shared-config

Network and token config; wagmi config and query client; constants (status labels, polling, explorer URLs). RPC URLs come from `getRpcUrl(networkId)` (env vars `RPC_<NETWORK_ID>` or public fallbacks).

- **Exports:** `NETWORKS`, `NETWORK_IDS`, `getNetwork`, `getEVMNetworks`, `getSolanaNetworks`, `getAptosNetworks`, `getAllNetworks`, `getChainIdForNetwork`, `getExplorerTxUrl`, `getExplorerAddressUrl`; `getTokenAddress`, `resolveFeeTokenAddress`, `TOKEN_ADDRESSES`, etc.; `ChainFamily`; `POLLING_CONFIG`, `getStatusDescription`, `getFaucetUrl`, `getDummyReceiver`, etc.
- **Subpaths:** `./wagmi`, `./queryClient`, `./networks`, `./tokens`.

### @ccip-examples/shared-utils

Browser-safe utilities: validation (`isValidAddress`, `isValidAmount`, `parseAmount`, `formatAmount`, `truncateAddress`), CCIP error parsing (`getCCIPErrorMessage`, `parseEVMError`, `parseSolanaError`), formatting (`formatLatency`, `formatElapsedTime`, `formatRelativeTime`), message building (`buildTokenTransferMessage`), clipboard (`copyToClipboard`, `COPIED_FEEDBACK_MS`), viem adapter (`toGenericPublicClient`). Node-only wallet/chain helpers live in `@ccip-examples/shared-utils/wallet`.

- **Subpaths:** `./hooks` (e.g. `useMessageStatus`, `useCopyToClipboard`).

### @ccip-examples/shared-components

React UI: primitives (Button, Input, Select, Alert), bridge (MessageProgress, TransferStatus, FeeTokenOptions, BalancesList), ErrorBoundary. All use design tokens from `@ccip-examples/shared-components/styles/tokens.css`. Import tokens once in app globals.

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
pnpm typecheck
pnpm lint
pnpm format           # Prettier write
pnpm format:check     # Prettier check (CI)
pnpm check            # typecheck + lint + format:check
```

## License

MIT
