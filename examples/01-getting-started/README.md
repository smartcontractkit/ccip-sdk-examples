# 01 - Getting Started with CCIP SDK

This example contains Node.js scripts demonstrating the fundamental operations of the CCIP SDK. Start here to learn the basics without UI complexity.

**Supports both EVM and Solana chains!**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Your Node.js Script                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CCIP SDK                                 │
│  ┌──────────────────┐       ┌──────────────────┐               │
│  │    EVMChain      │       │   SolanaChain    │               │
│  │  ─────────────   │       │  ─────────────   │               │
│  │  • getFee()      │       │  • getFee()      │               │
│  │  • sendMessage() │       │  • sendMessage() │               │
│  │  • getMessageById│       │  • getMessageById│               │
│  │  • getTokenInfo()│       │  • getTokenInfo()│               │
│  └──────────────────┘       └──────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐      ┌──────────────────────┐
│   ethers.js          │      │   @solana/web3.js    │
│   (EVM Provider)     │      │   (Solana Connection)│
└──────────────────────┘      └──────────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐      ┌──────────────────────┐
│   EVM RPC            │      │   Solana RPC         │
│   (Sepolia, Base,    │      │   (Devnet)           │
│    Fuji, etc.)       │      │                      │
└──────────────────────┘      └──────────────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
           ┌──────────────────────────────┐
           │     Chainlink CCIP           │
           │   (Cross-Chain Protocol)     │
           └──────────────────────────────┘
```

## What You'll Learn

- Initialize the CCIP SDK with ethers.js (EVM) or @solana/web3.js (Solana)
- Estimate cross-chain transfer fees
- Send token transfers across chains
- Track message status
- Discover supported tokens
- Inspect token pool configurations

## Prerequisites

### Node.js Version

**Node.js v22+** is required for this project. We recommend using [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions:

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Install and use Node.js v22
nvm install 22
nvm use 22

# Verify version
node --version  # Should show v22.x.x
```

### Testnet Wallet

**For EVM chains:**

- Sepolia ETH (for gas fees)
- CCIP-BnM tokens (for transfers)

**For Solana:**

- SOL on devnet (for gas fees)
- CCIP-BnM tokens on Solana devnet (for transfers)

### Getting Testnet Tokens

- **Sepolia ETH**: [Chainlink Faucet](https://faucets.chain.link/sepolia)
- **Solana Devnet SOL**: [Solana Faucet](https://faucet.solana.com/)
- **CCIP-BnM**: [CCIP Faucet](https://docs.chain.link/ccip/test-tokens)

## Quick Start

```bash
# From the monorepo root
cd examples/01-getting-started

# Copy environment file and add your private key
cp .env.example .env

# Edit .env and add your PRIVATE_KEY
# For EVM: hex private key (with or without 0x prefix)
# For Solana: base58 encoded secret key

# Run scripts
pnpm chains        # List all supported chains and their keys
pnpm fees          # Estimate fees for all routes (EVM + Solana)
pnpm tokens        # List supported tokens
pnpm pools         # Inspect pool configurations
pnpm transfer      # Send EVM → EVM transfer (interactive, with defaults)
pnpm transfer --source solana-devnet   # Send Solana → EVM transfer
pnpm status <id>   # Check message status (searches EVM + Solana)
```

## Scripts

### `pnpm fees`

Estimates transfer fees across all available routes (EVM and Solana). No wallet required.

```
CCIP SDK: Fee Estimation Across All Routes (EVM + Solana)
======================================================================
Estimating fees for transferring 1.0 CCIP-BnM

Route                                         Fee                 Status
---------------------------------------------------------------------------
Ethereum Sepolia → Base Sepolia               0.001234 ETH        OK
Ethereum Sepolia → Avalanche Fuji             0.001456 ETH        OK
Solana Devnet → Ethereum Sepolia              0.012345 SOL        OK
...
```

### `pnpm tokens`

Discovers supported tokens for a specific lane.

```bash
pnpm tokens                                              # Show usage and example
pnpm tokens ethereum-testnet-sepolia ethereum-testnet-sepolia-base-1  # EVM lane
pnpm tokens solana-devnet ethereum-testnet-sepolia       # Solana → EVM lane
```

### `pnpm pools`

Inspects token pool configurations including rate limits.

```bash
pnpm pools                                              # All CCIP-BnM pools (EVM + Solana)
pnpm pools ethereum-testnet-sepolia 0xFd57b...          # Specific EVM pool
pnpm pools solana-devnet 3PjyGzj...                     # Solana token info
```

### `pnpm transfer`

Sends a cross-chain token transfer. Requires `PRIVATE_KEY` in `.env`.

```bash
pnpm transfer                                    # EVM → EVM with defaults (Sepolia → Base Sepolia)
pnpm transfer --source solana-devnet             # Solana → EVM (Solana Devnet → Sepolia)
pnpm transfer --source ethereum-testnet-sepolia --dest avalanche-testnet-fuji  # Custom route
pnpm transfer --amount 0.01 --receiver 0x...     # Custom amount and receiver
pnpm transfer -v                                 # Verbose mode
pnpm transfer -y                                 # Skip confirmation prompt
```

### `pnpm status <message_id>`

Checks the status of a cross-chain message. Searches across both EVM and Solana networks.

```bash
pnpm status 0x1234567890abcdef...
```

## Key SDK Functions Used

### EVM (EVMChain)

| Function                     | Description                 |
| ---------------------------- | --------------------------- |
| `EVMChain.fromUrl()`         | Initialize SDK from RPC URL |
| `chain.getFee()`             | Estimate transfer fee       |
| `chain.sendMessage()`        | Send cross-chain message    |
| `chain.getMessageById()`     | Get message status          |
| `chain.getTokenInfo()`       | Get token metadata          |
| `chain.getBalance()`         | Get native/token balance    |
| `chain.getSupportedTokens()` | List supported tokens       |
| `chain.getTokenPoolRemote()` | Get pool configuration      |

### Solana (SolanaChain)

| Function                 | Description                 |
| ------------------------ | --------------------------- |
| `SolanaChain.fromUrl()`  | Initialize SDK from RPC URL |
| `chain.getFee()`         | Estimate transfer fee       |
| `chain.sendMessage()`    | Send cross-chain message    |
| `chain.getMessageById()` | Get message status          |
| `chain.getTokenInfo()`   | Get token metadata          |
| `chain.getBalance()`     | Get native/token balance    |

### Shared

| Function                 | Description                     |
| ------------------------ | ------------------------------- |
| `networkInfo(networkId)` | Get chain selector and metadata |

## Solana-Specific Notes

### Private Key Format

Solana uses base58-encoded secret keys (not hex like EVM):

```bash
# Generate a Solana keypair (if needed)
solana-keygen new --outfile ~/.config/solana/devnet.json

# Export the secret key in base58 format
# The key is an array of bytes in the JSON file
# Use a tool or script to convert it to base58
```

### Extra Args for Solana

When sending from Solana, you need Solana-specific extra args:

```typescript
const message = {
  receiver: evmAddress,
  data: "0x",
  tokenAmounts: [{ token: tokenAddress, amount }],
  extraArgs: {
    computeUnits: 0n, // Solana compute units
    allowOutOfOrderExecution: true, // Allow parallel execution
    tokenReceiver: solanaAddress, // Receiver for tokens
    accounts: [], // Additional accounts
    accountIsWritableBitmap: 0n, // Account permissions
  },
};
```

## Project Structure

```
01-getting-started/
├── src/
│   ├── transfer-tokens.ts    # Send cross-chain transfer (EVM + Solana)
│   ├── estimate-fees.ts      # Estimate fees (EVM + Solana)
│   ├── get-status.ts         # Check message status (EVM + Solana)
│   ├── supported-tokens.ts   # Discover tokens (EVM + Solana)
│   ├── inspect-pools.ts      # Inspect pool config (EVM + Solana)
│   └── list-chains.ts        # List supported chains
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Next Steps

After understanding the basics:

1. **[02-evm-simple-bridge](../02-evm-simple-bridge)** - Add browser UI with MetaMask (EVM only)

## Troubleshooting

### "Insufficient balance"

Get testnet tokens from the faucets linked above.

### "Rate limit reached"

The token pool's rate limit bucket is depleted. Wait for it to refill or try a smaller amount.

### "Message not found"

CCIP messages take time to be indexed. Wait a few minutes and try again.

### "Invalid Solana private key"

Make sure your Solana private key is base58 encoded. If you have a keypair JSON file, you need to convert the byte array to base58 format.

### Node.js version errors

Ensure you're using Node.js v22+:

```bash
node --version  # Should be v22.x.x or higher
nvm use 22      # Switch to Node 22 if using nvm
```
