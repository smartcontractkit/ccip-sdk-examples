# CCIP SDK Examples

> **CCIP SDK** [`@chainlink/ccip-sdk@0.96.0`](https://www.npmjs.com/package/@chainlink/ccip-sdk/v/0.96.0) | **Testnet only** | [CCIP Docs](https://docs.chain.link/ccip) | [CCIP Explorer](https://ccip.chain.link)

Educational examples for the [Chainlink CCIP SDK](https://www.npmjs.com/package/@chainlink/ccip-sdk) — progressive tutorials for cross-chain token transfers across EVM, Solana, and other supported chain families.

[![CI](https://github.com/smartcontractkit/ccip-sdk-examples/actions/workflows/ci.yml/badge.svg)](https://github.com/smartcontractkit/ccip-sdk-examples/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node: >=22.0.0](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](package.json)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

> **Disclaimer**
>
> _This tutorial represents an educational example to use a Chainlink system, product, or service and is provided to demonstrate how to interact with Chainlink's systems, products, and services to integrate them into your own. This template is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, it has not been audited, and it may be missing key checks or error handling to make the usage of the system, product or service more clear. Do not use the code in this example in a production environment without completing your own audits and application of best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs that are generated due to errors in code._

## Examples

| Example                                                 | Description                  | Complexity            |
| ------------------------------------------------------- | ---------------------------- | --------------------- |
| [01-getting-started](./examples/01-getting-started)     | Node.js scripts - SDK basics | Beginner              |
| [02-evm-simple-bridge](./examples/02-evm-simple-bridge) | Browser bridge with MetaMask | Beginner-Intermediate |

## Quick Start

### Prerequisites

- **Node.js 22+**
- **pnpm 10+** (install: `npm install -g pnpm`)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd ccip-sdk-examples
pnpm install

# Build shared packages
pnpm build:packages
```

### Run Examples

```bash
# 01 - Getting Started (Node.js scripts)
cd examples/01-getting-started
pnpm chains                                                            # List supported chains
pnpm fees -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1   # Estimate fees
pnpm tokens -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1 # Supported tokens

# 02 - Simple Bridge (Browser)
pnpm dev:02                    # Start dev server at localhost:5173
```

## Learning Path

```
Start Here
    │
    ▼
┌─────────────────────────────────────┐
│  01-getting-started                 │
│  • SDK basics without UI complexity │
│  • Fee estimation                   │
│  • Token discovery                  │
│  • Pool inspection                  │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  02-evm-simple-bridge               │
│  • Browser + MetaMask integration   │
│  • Simple React UI                  │
│  • Basic transfer flow              │
└─────────────────────────────────────┘
```

## Project Structure

```
ccip-sdk-examples/
├── examples/
│   ├── 01-getting-started/     # Node.js scripts
│   └── 02-evm-simple-bridge/   # Browser app with MetaMask
│
├── packages/
│   ├── shared-config/          # Network & token configuration
│   └── shared-utils/           # Validation & error handling
│
├── docs/                       # Additional documentation
├── pnpm-workspace.yaml         # Workspace configuration
└── package.json                # Root scripts
```

## Shared Packages

### @ccip-examples/shared-config

Network, token, and constant configuration shared across all examples.

```typescript
import {
  // Networks
  NETWORKS, // All supported networks with config
  NETWORK_IDS, // Array of network keys
  getAllNetworks, // Get networks with key, name, family
  getNetwork, // Get config by network key

  // Tokens
  getTokenAddress, // Get token address for network
  LINK_TOKEN_ADDRESSES, // LINK addresses per network
  resolveFeeTokenAddress, // "native" | "link" → on-chain address

  // Display & constants
  CHAIN_FAMILY_LABELS, // Human-friendly labels per ChainFamily
  getDummyReceiver, // Format-valid dummy address per family
  getStatusDescription, // Human-readable CCIP status descriptions
  getExplorerTxUrl, // Build explorer URL for tx
  ChainFamily, // Re-exported from SDK
} from "@ccip-examples/shared-config";
```

### @ccip-examples/shared-utils

Chain factories, wallet factories, validation, and formatting utilities.

```typescript
import {
  // Chain & wallet factories
  createChain, // Family-agnostic Chain instance from networkId + rpcUrl
  createLogger, // Logger with configurable verbosity (-v flag)
  createWallet, // Family-agnostic wallet from env var (EVM_PRIVATE_KEY / SVM_PRIVATE_KEY)
  createSolanaWallet, // Solana wallet from file path, hex, or base58

  // Message building
  buildTokenTransferMessage, // Build MessageInput for token transfers

  // Validation & formatting
  parseAmount, // "1.5" + 18 decimals → bigint
  formatAmount, // bigint + 18 decimals → "1.5"
  isValidAddress, // Validate address by chain type
  truncateAddress, // "0x1234...5678"

  // Error handling
  getErrorMessage, // Extract message from unknown errors
} from "@ccip-examples/shared-utils";
```

## Supported Networks

| Network          | Type   | Chain Selector       |
| ---------------- | ------ | -------------------- |
| Ethereum Sepolia | EVM    | 16015286601757825753 |
| Base Sepolia     | EVM    | 10344971235874465080 |
| Avalanche Fuji   | EVM    | 14767482510784806043 |
| Solana Devnet    | Solana | 16423721717087811551 |

## Getting Testnet Tokens

- **Sepolia ETH**: [Chainlink Faucet](https://faucets.chain.link/sepolia)
- **Base Sepolia ETH**: [Chainlink Faucet](https://faucets.chain.link/base-sepolia)
- **Fuji AVAX**: [Chainlink Faucet](https://faucets.chain.link/fuji)
- **Devnet SOL**: `solana airdrop 3 --url devnet` or [Solana Faucet](https://faucet.solana.com/)
- **CCIP-BnM**: [CCIP Test Tokens](https://docs.chain.link/ccip/test-tokens)
- **LINK**: [Chainlink Faucet](https://faucets.chain.link/)

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run type checking
pnpm typecheck

# Run linting
pnpm lint

# Format code
pnpm format
```

## Quality Tools

- **ESLint 10** - Flat config with TypeScript support
- **Prettier 3.8** - Code formatting
- **TypeScript 5.9** - Strict type checking
- **Husky** - Pre-commit hooks
- **lint-staged** - Run linters on staged files

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm check` to verify quality
5. Submit a pull request

## License

MIT
