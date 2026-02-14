# CCIP SDK Examples

Educational examples for the [Chainlink CCIP SDK](https://www.npmjs.com/package/@chainlink/ccip-sdk) — progressive tutorials for cross-chain token transfers on EVM and Solana.

[![CI](https://github.com/smartcontractkit/ccip-sdk-examples/actions/workflows/ci.yml/badge.svg)](https://github.com/smartcontractkit/ccip-sdk-examples/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node: >=22.0.0](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](package.json)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io/)

> **Disclaimer**
>
> _This repository contains example code of how a Chainlink product or service can be used. It is provided solely to demonstrate a potential integration approach and is not intended for production. This repository is provided "AS IS" without warranties of any kind, has not been audited, may be incomplete, and may be missing key checks or error handling mechanisms. You are solely responsible for testing and simulating all code and transactions, validating functionality on testnet environments, and conducting comprehensive security, technical, and engineering reviews before deploying anything to any mainnet or production environments. SmartContract Chainlink Limited SEZC (“Chainlink Labs”) disclaims all liability for any loss or damage arising from or related to your use of or reliance on this repository. Chainlink Labs does not represent or warrant that the repository will be uninterrupted, available at any particular time, or error-free._

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
pnpm dev:01                    # Show available commands
pnpm -F 01-getting-started fees   # Estimate fees
pnpm -F 01-getting-started tokens # List supported tokens

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

Network and token configuration shared across all examples.

```typescript
import {
  NETWORKS, // All supported networks with config
  NETWORK_IDS, // Array of network keys
  getAllNetworks, // Get networks with key, name, chainFamily
  getNetwork, // Get config by network key
  getEVMNetworks, // Filter EVM networks
  getSolanaNetworks, // Filter Solana networks
  getTokenAddress, // Get token address for network
  getExplorerTxUrl, // Build explorer URL for tx
  DUMMY_ADDRESSES, // Placeholder addresses for testing
  getStatusDescription, // Human-readable status descriptions
} from "@ccip-examples/shared-config";

// Network keys match SDK networkIds
const config = NETWORKS["ethereum-testnet-sepolia"];
// { name, chainFamily, rpcUrl, explorerUrl, nativeCurrency, routerAddress }
```

### @ccip-examples/shared-utils

Validation, formatting, and error handling utilities.

```typescript
import {
  // Validation
  isValidEVMAddress, // Validate EVM address
  isValidSolanaAddress, // Validate Solana address
  isValidMessageId, // Validate CCIP message ID
  isValidAmount, // Validate amount string

  // Formatting
  parseAmount, // "1.5" + 18 decimals → bigint
  formatAmount, // bigint + 18 decimals → "1.5"
  truncateAddress, // "0x1234...5678"
  normalizeMessageId, // Ensure 0x prefix

  // Error handling
  categorizeError, // Classify errors with recovery suggestions
  withRetry, // Retry with exponential backoff
  isTransientError, // Check if error is retryable
} from "@ccip-examples/shared-utils";

// Error handling example
const { message, category, recovery } = categorizeError(error);
// category: "network" | "validation" | "balance" | "rate_limit" | "unknown"
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
- **CCIP-BnM**: [CCIP Faucet](https://docs.chain.link/ccip/test-tokens)

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
