# 01 - Getting Started with CCIP SDK

> **CCIP SDK** [`@chainlink/ccip-sdk@0.96.0`](https://www.npmjs.com/package/@chainlink/ccip-sdk/v/0.96.0) | **Testnet only** | [CCIP Docs](https://docs.chain.link/ccip) | [CCIP Explorer](https://ccip.chain.link)

Node.js scripts demonstrating the fundamental operations of the CCIP SDK. Start here to learn the basics without UI complexity.

All scripts are **chain-family-agnostic** — the same code path works for EVM, Solana, and any future chain family the SDK supports, through the unified `Chain` base class and `createChain` factory.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Your Node.js Script                        │
│              (uses Chain base class everywhere)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                 createChain(networkId, rpcUrl)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          CCIP SDK                               │
│                                                                 │
│   Chain (abstract base)       CCIPAPIClient                     │
│   ──────────────────────      ─────────────                     │
│   • getFee()                  • getMessageById()                │
│   • sendMessage()             • getLaneLatency()                │
│   • getTokenInfo()                                              │
│   • getSupportedTokens()                                        │
│   • getTokenPoolRemote()                                        │
│   • getBalance()                                                │
│         │                                                       │
│    ┌────┴────┬────────────┬──────────┬──────────┐               │
│    │EVMChain │SolanaChain │AptosChain│TONChain  │  ...          │
│    └─────────┴────────────┴──────────┴──────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                      Blockchain RPCs
```

## What You'll Learn

- Create chain instances with `createChain()` (family-agnostic)
- Estimate cross-chain transfer fees (native or LINK)
- Send token transfers across chains
- Track message status via the CCIP API
- Discover supported tokens on a lane
- Inspect token pool configurations and rate limits

## Prerequisites

### Node.js Version

**Node.js v22+** is required. We recommend [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 22
nvm use 22
node --version  # Should show v22.x.x
```

### Testnet Tokens

| What                                  | Where                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| Sepolia ETH (gas)                     | [Chainlink Faucet](https://faucets.chain.link/sepolia)       |
| Devnet SOL (gas)                      | [Solana Faucet](https://faucet.solana.com/)                  |
| CCIP-BnM (transfer token)             | [CCIP Test Tokens](https://docs.chain.link/ccip/test-tokens) |
| LINK (optional, for LINK fee payment) | [Chainlink Faucet](https://faucets.chain.link/)              |

## Quick Start

```bash
# From the monorepo root
cd examples/01-getting-started

# Copy environment file
cp .env.example .env

# Edit .env — set the key(s) for your chain family:
#   EVM_PRIVATE_KEY=0x...           (hex private key)
#   SVM_PRIVATE_KEY=~/.config/solana/devnet.json  (keypair file or base58)
#
# Both can coexist — the script picks the right one based on --source.
# See .env.example for full instructions.

# Explore
pnpm chains                                                              # List supported chains
pnpm tokens  -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1  # Supported tokens on lane
pnpm pools                                                               # Inspect all CCIP-BnM pools
pnpm fees    -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1  # Estimate fee (native)
pnpm fees    -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1 -f link  # Fee in LINK

# Transfer (requires PRIVATE_KEY in .env)
pnpm transfer -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1
pnpm transfer -s solana-devnet -d ethereum-testnet-sepolia -f link

# Track
pnpm status 0x<message_id>
```

## Scripts

### `pnpm chains`

Lists all configured chains grouped by family.

### `pnpm fees`

Estimates the transfer fee for a specific route.

```bash
pnpm fees -s <source> -d <dest>                    # Native fee (default)
pnpm fees -s <source> -d <dest> --fee-token link   # LINK fee
pnpm fees -s <source> -d <dest> -t CCIP-BnM -a 5.0 # Custom token/amount
```

| Flag              | Description                      | Default    |
| ----------------- | -------------------------------- | ---------- |
| `-s, --source`    | Source chain key (required)      | —          |
| `-d, --dest`      | Destination chain key (required) | —          |
| `-t, --token`     | Token symbol                     | `CCIP-BnM` |
| `-a, --amount`    | Amount to estimate for           | `1.0`      |
| `-f, --fee-token` | `native` or `link`               | `native`   |

### `pnpm tokens`

Discovers supported tokens for a lane, including pool addresses and rate limits.

```bash
pnpm tokens -s ethereum-testnet-sepolia -d ethereum-testnet-sepolia-base-1
pnpm tokens -s solana-devnet -d ethereum-testnet-sepolia
```

| Flag           | Description                      |
| -------------- | -------------------------------- |
| `-s, --source` | Source chain key (required)      |
| `-d, --dest`   | Destination chain key (required) |

### `pnpm pools`

Inspects token pool configurations including rate limits for all destinations.

```bash
pnpm pools                                                            # All CCIP-BnM pools
pnpm pools ethereum-testnet-sepolia 0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05  # Specific pool
pnpm pools solana-devnet 3PjyGzj1jGVgHSKS4VR1Hr1memm63PmN8L9rtPDKwzZ6
```

### `pnpm transfer`

Sends a cross-chain token transfer. Requires `EVM_PRIVATE_KEY` and/or `SVM_PRIVATE_KEY` in `.env`.

```bash
pnpm transfer -s <source> -d <dest>                       # Transfer with native fee
pnpm transfer -s <source> -d <dest> -f link               # Pay fee in LINK
pnpm transfer -s <source> -d <dest> -a 0.5 -r 0x...      # Custom amount & receiver
pnpm transfer -s <source> -d <dest> -v                    # Verbose mode
pnpm transfer -s <source> -d <dest> -y                    # Skip confirmation
```

| Flag              | Description                                    | Default                     |
| ----------------- | ---------------------------------------------- | --------------------------- |
| `-s, --source`    | Source chain key (required)                    | —                           |
| `-d, --dest`      | Destination chain key (required)               | —                           |
| `-t, --token`     | Token symbol                                   | `CCIP-BnM`                  |
| `-a, --amount`    | Amount to transfer                             | `0.001`                     |
| `-r, --receiver`  | Receiver address                               | Self (same family) or dummy |
| `-f, --fee-token` | `native` or `link`                             | `native`                    |
| `-k, --keypair`   | Keypair file/key (overrides `SVM_PRIVATE_KEY`) | env var                     |
| `-v, --verbose`   | Enable debug logging                           | `false`                     |
| `-y, --yes`       | Skip confirmation prompt                       | `false`                     |

### `pnpm status <message_id>`

Checks the status of a cross-chain message via the CCIP API.

```bash
pnpm status 0x1234567890abcdef...
```

The CCIP API is a centralized index — one call locates any message regardless of which chain it was sent from.

## Key SDK Concepts

### Chain (base class)

All scripts use the abstract `Chain` base class. Concrete instances are created via the `createChain(networkId, rpcUrl)` factory from `@ccip-examples/shared-utils`.

| Method                             | Description                           |
| ---------------------------------- | ------------------------------------- |
| `chain.getFee()`                   | Estimate transfer fee                 |
| `chain.sendMessage()`              | Send cross-chain message              |
| `chain.getTokenInfo()`             | Get token metadata (symbol, decimals) |
| `chain.getBalance()`               | Get native or token balance           |
| `chain.getSupportedTokens()`       | List registered tokens                |
| `chain.getTokenAdminRegistryFor()` | Get token registry address            |
| `chain.getRegistryTokenConfig()`   | Get token's pool assignment           |
| `chain.getTokenPoolRemote()`       | Get pool config for a destination     |
| `chain.getTokenPoolConfig()`       | Get pool type and version             |

### CCIPAPIClient

Used by `get-status.ts` for message lookups. No chain instance needed.

| Method                       | Description           |
| ---------------------------- | --------------------- |
| `apiClient.getMessageById()` | Look up message by ID |

### Shared Utilities

| Function                      | Package                        | Description                                       |
| ----------------------------- | ------------------------------ | ------------------------------------------------- |
| `createChain()`               | `@ccip-examples/shared-utils`  | Family-agnostic chain factory                     |
| `createWallet()`              | `@ccip-examples/shared-utils`  | Family-agnostic wallet factory (reads env vars)   |
| `createSolanaWallet()`        | `@ccip-examples/shared-utils`  | Solana wallet from file path, hex, or base58      |
| `createLogger()`              | `@ccip-examples/shared-utils`  | Logger with configurable verbosity                |
| `buildTokenTransferMessage()` | `@ccip-examples/shared-utils`  | Build a `MessageInput` for token transfers        |
| `networkInfo()`               | `@chainlink/ccip-sdk`          | Get chain selector and metadata                   |
| `resolveFeeTokenAddress()`    | `@ccip-examples/shared-config` | Resolve `"native"`/`"link"` to on-chain address   |
| `getDummyReceiver()`          | `@ccip-examples/shared-config` | Get a format-valid dummy address per chain family |

## Solana-Specific Notes

### Private Key / Keypair

`SVM_PRIVATE_KEY` supports multiple formats:

**Option 1: Keypair file path (recommended)**

Point directly to a `solana-keygen` JSON file — no manual conversion needed:

```bash
# Generate a keypair (if you don't have one)
solana-keygen new --outfile ~/.config/solana/devnet.json

# Set in .env
SVM_PRIVATE_KEY=~/.config/solana/devnet.json
```

**Option 2: Base58-encoded secret key**

```bash
SVM_PRIVATE_KEY=4wBqpZM9k...
```

**Option 3: Hex-encoded secret key**

```bash
SVM_PRIVATE_KEY=0x...
```

### Getting Devnet SOL

You need SOL for gas fees on Solana Devnet. Use the Solana CLI airdrop:

```bash
# Airdrop 3 SOL to your devnet wallet
solana airdrop 3 --url devnet

# Or airdrop to a specific address
solana airdrop 3 <YOUR_ADDRESS> --url devnet
```

You can also use the [Solana Faucet](https://faucet.solana.com/) web interface.

### Extra Args

When sending **to** Solana, the SDK's `buildMessageForDest` automatically populates Solana-specific extra args (`computeUnits`, `tokenReceiver`, `accounts`, etc.). You don't need to construct them manually.

## Project Structure

```
01-getting-started/
├── src/
│   ├── transfer-tokens.ts    # Send cross-chain transfer
│   ├── estimate-fees.ts      # Estimate transfer fees
│   ├── get-status.ts         # Check message status
│   ├── supported-tokens.ts   # Discover tokens on a lane
│   ├── inspect-pools.ts      # Inspect pool configurations
│   └── list-chains.ts        # List supported chains
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### "Insufficient balance"

Get testnet tokens from the faucets linked above.

### "Rate limit reached"

The token pool's rate limit bucket is depleted. Wait for it to refill or try a smaller amount.

### "Message not found"

CCIP messages take time to be indexed. Wait a few minutes and try again.

### "SVM_PRIVATE_KEY is not set" / "Invalid Solana private key"

Set `SVM_PRIVATE_KEY` in `.env` to a keypair file path, base58, or hex key. See the Solana-Specific Notes section above.

### Node.js version errors

Ensure you're using Node.js v22+:

```bash
node --version  # Should be v22.x.x or higher
nvm use 22      # Switch if using nvm
```
