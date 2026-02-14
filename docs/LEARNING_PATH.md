# Learning Path

## Overview

This repository contains progressive examples for learning the CCIP SDK.

## Example Progression

### Level 1: Beginner

**01-getting-started**

- No UI complexity
- Pure Node.js scripts
- Learn SDK fundamentals:
  - Initialize chains
  - Estimate fees
  - Query tokens
  - Inspect pools

### Level 2: Beginner-Intermediate

**02-evm-simple-bridge**

- Browser-based UI
- MetaMask integration
- Simple React patterns
- Basic transfer flow

## Key Concepts

### Chain Selectors vs Chain IDs

CCIP uses **chain selectors** (unique 64-bit identifiers) for routing, NOT standard blockchain chain IDs.

```typescript
// Chain ID (used for wallet connections)
const ethereumSepoliaChainId = 11155111;

// Chain Selector (used for CCIP routing)
const ethereumSepoliaSelector = 16015286601757825753n;
```

### SDK Initialization

```typescript
// EVM chains - from RPC URL
const chain = await EVMChain.fromUrl("https://rpc-url");

// Solana - from RPC URL
const solana = await SolanaChain.fromUrl("https://solana-rpc");
```

### Fee Estimation

Always estimate fees before sending:

```typescript
const fee = await chain.getFee({
  router: routerAddress,
  destChainSelector: destinationSelector,
  message: {
    receiver: "0x...",
    data: "0x",
    tokenAmounts: [{ token, amount }],
    extraArgs: { gasLimit: 0n },
  },
});
```

## Resources

- [CCIP Documentation](https://docs.chain.link/ccip)
- [SDK npm Package](https://www.npmjs.com/package/@chainlink/ccip-sdk)
- [CCIP Explorer](https://ccip.chain.link)
