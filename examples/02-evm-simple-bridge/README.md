# 02-evm-simple-bridge

> **CCIP SDK** [`@chainlink/ccip-sdk@1.0.0`](https://www.npmjs.com/package/@chainlink/ccip-sdk/v/1.0.0) | **Testnet only** | [CCIP Docs](https://docs.chain.link/ccip) | [CCIP Explorer](https://ccip.chain.link)

> **Disclaimer**
>
> _This tutorial represents an educational example to use a Chainlink system, product, or service and is provided to demonstrate how to interact with Chainlink's systems, products, and services to integrate them into your own. This template is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, it has not been audited, and it may be missing key checks or error handling to make the usage of the system, product or service more clear. Do not use the code in this example in a production environment without completing your own audits and application of best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs that are generated due to errors in code._

A minimal EVM-to-EVM token bridge using the Chainlink CCIP SDK with modern React tooling.

**Send flow:** This example calls `chain.sendMessage()`. The SDK handles token approval (if needed) and the send in one flow; wallet prompts are triggered inside the SDK. Example 03 instead uses `generateUnsignedSendMessage()` and passes the unsigned transaction to the wallet for signing and sending.

## Architecture

This example demonstrates the modern EVM wallet stack integrated with the CCIP SDK:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              React Application                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────────────────────────────────────────┐    │
│  │ RainbowKit  │    │                    App.tsx                      │    │
│  │   (UI)      │    │  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │    │
│  │             │    │  │ BridgeForm  │  │TransferStatus│  │Message  │ │    │
│  │ • Connect   │    │  │             │  │             │  │Progress │ │    │
│  │   Button    │    │  │ • Networks  │  │ • Status    │  │         │ │    │
│  │ • Modal     │    │  │ • Amount    │  │ • Tx Links  │  │ • Steps │ │    │
│  │ • Account   │    │  │ • Max Btn   │  │ • Errors    │  │ • Timer │ │    │
│  └──────┬──────┘    │  └──────┬──────┘  └──────┬──────┘  └────┬────┘ │    │
│         │           └─────────┼────────────────┼──────────────┼──────┘    │
│         │                     │                │              │           │
├─────────┼─────────────────────┼────────────────┼──────────────┼───────────┤
│         │                     │                │              │           │
│         ▼                     ▼                ▼              ▼           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         Custom React Hooks                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │  │
│  │  │ useTransfer  │  │useFeeTokens │  │useWalletBals│  │useMsgStat│  │  │
│  │  │              │  │              │  │              │  │          │  │  │
│  │  │• estimateFee │  │• getFeeTokens│  │• token bal   │  │• polling │  │  │
│  │  │• transfer()  │  │• balances    │  │              │  │• elapsed │  │  │
│  │  │• feeToken    │  │• selection   │  │              │  │• final   │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  │  │
│  └─────────┼─────────────────┼─────────────────┼───────────────┼────────┘  │
│           │                 │                 │               │          │
├───────────┼─────────────────┼─────────────────┼───────────────┼──────────┤
│           │                 │                 │               │          │
│           ▼                 ▼                 ▼               ▼          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                              wagmi                                  │  │
│  │                     (React Hooks for Ethereum)                      │  │
│  │                                                                     │  │
│  │   useAccount()  useWalletClient()  useSwitchChain()  getPublicClient│  │
│  │   ─────────────────────────┬───────────────────────────────────────│  │
│  └────────────────────────────┼───────────────────────────────────────┘  │
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                              viem                                   │  │
│  │                    (TypeScript Ethereum Library)                    │  │
│  │                                                                     │  │
│  │    PublicClient (read)          WalletClient (write/sign)          │  │
│  │    ───────────────────────────────────────────────────────────────│  │
│  └──────────────┬──────────────────────────────┬──────────────────────┘  │
│                 │                              │                         │
│    ┌────────────┴────────────┐    ┌────────────┴────────────┐           │
│    │   toGenericPublicClient │    │      viemWallet()       │           │
│    │   (shared-utils)        │    │   (SDK adapter)         │           │
│    └────────────┬────────────┘    └────────────┬────────────┘           │
│                 │                              │                         │
│                 ▼                              ▼                         │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                         CCIP SDK                                    │  │
│  │                  (@chainlink/ccip-sdk/viem)                         │  │
│  │                                                                     │  │
│  │  fromViemClient()  →  Chain Instance  →  SDK Methods                │  │
│  │                                                                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │  │
│  │  │ getTokenInfo│  │   getFee    │  │ sendMessage │  │getMessageBy│  │  │
│  │  │             │  │             │  │             │  │    Id      │  │  │
│  │  │ • symbol    │  │ • estimate  │  │ • approve   │  │ • status   │  │  │
│  │  │ • decimals  │  │ • native    │  │ • send tx   │  │ • destTx   │  │  │
│  │  │ • name      │  │   currency  │  │ • messageId │  │ • metadata │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │  │
│  └──────────────────────────────┬──────────────────────────────────────┘  │
│                                 │                                         │
└─────────────────────────────────┼─────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Blockchain Networks                               │
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │  Sepolia (ETH)  │    │  Base Sepolia   │    │ Avalanche Fuji  │        │
│   │   chainId:      │    │   chainId:      │    │   chainId:      │        │
│   │   11155111      │    │   84532         │    │   43113         │        │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│            │                      │                      │                 │
│            └──────────────────────┼──────────────────────┘                 │
│                                   │                                        │
│                                   ▼                                        │
│                    ┌──────────────────────────┐                            │
│                    │      Chainlink CCIP      │                            │
│                    └──────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

| Step | Component             | Action                                                                      |
| ---- | --------------------- | --------------------------------------------------------------------------- |
| 1    | **RainbowKit**        | User connects wallet                                                        |
| 2    | **wagmi**             | Manages wallet state, provides hooks                                        |
| 3    | **BridgeForm**        | User enters transfer details, selects fee token                             |
| 4    | **useFeeTokens**      | Discovers available fee tokens via `getFeeTokens()`, fetches their balances |
| 5    | **useWalletBalances** | Fetches transfer token (CCIP-BnM) balance via SDK → viem → RPC              |
| 6    | **useTransfer**       | Estimates fee via `getFee()` + delivery time via `getLaneLatency()`         |
| 7    | **wagmi**             | Prompts wallet for signature                                                |
| 8    | **CCIP SDK**          | `sendMessage()` handles approval + send                                     |
| 9    | **useMessageStatus**  | Polls `CCIPAPIClient.getMessageById()` (no chain instance needed)           |
| 10   | **MessageProgress**   | Displays visual stepper until complete                                      |

### Key Adapters

```typescript
// 1. wagmi → viem (built-in)
const publicClient = getPublicClient(wagmiConfig, { chainId });
const walletClient = useWalletClient();

// 2. viem → CCIP SDK (adapters from SDK + shared-utils)
import { fromViemClient, viemWallet } from "@chainlink/ccip-sdk/viem";
import { CCIPAPIClient, networkInfo } from "@chainlink/ccip-sdk";
import { toGenericPublicClient } from "@ccip-examples/shared-utils";

// Chain instance for on-chain operations (fee, send)
const chain = await fromViemClient(toGenericPublicClient(publicClient));

// Destination chain selector from static metadata — no RPC needed
const destChainSelector = networkInfo(destNetworkId).chainSelector;

// Fee + estimated delivery time (parallel)
const [fee, latency] = await Promise.all([
  chain.getFee({ router, destChainSelector, message }),
  chain.getLaneLatency(destChainSelector),
]);

// Send (SDK handles approvals + tx)
const request = await chain.sendMessage({
  wallet: viemWallet(walletClient),
  // ...
});

// Status tracking — via CCIPAPIClient (default URL, no staging override)
const api = new CCIPAPIClient();
const status = await api.getMessageById(request.message.messageId);
```

## What You'll Learn

- Modern wallet integration with **wagmi + viem + RainbowKit**
- CCIP SDK integration via the **viem adapter**
- Fee estimation with choice of fee token (dynamically discovered via `getFeeTokens()`)
- Fetching fee token and transfer token balances via SDK
- Token approval + CCIP send flow
- Cross-chain message status tracking

## Prerequisites

### 1. Node.js (v22+)

We recommend using [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions:

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Install and use Node.js v22
nvm install 22
nvm use 22

# Verify version
node --version  # Should show v22.x.x
```

### 2. pnpm Package Manager

```bash
npm install -g pnpm
```

### 3. Browser Wallet

Install [MetaMask](https://metamask.io) or another EVM-compatible wallet.

Add testnet networks using [chainlist.org](https://chainlist.org):

- **Sepolia** (chainId: 11155111)
- **Base Sepolia** (chainId: 84532)
- **Avalanche Fuji** (chainId: 43113)

### 4. Testnet Tokens

You'll need two types of tokens:

**Native tokens for gas fees:**

- Get from [Chainlink Faucets](https://faucets.chain.link):
  - Sepolia ETH
  - Base Sepolia ETH
  - Avalanche Fuji AVAX

**CCIP-BnM test tokens for bridging:**

- Get from [CCIP Test Tokens](https://docs.chain.link/ccip/test-tokens)
- These are the tokens you'll transfer across chains

## Installation

**Important:** Before running the app, you must install dependencies and build shared packages from the monorepo root.

```bash
# From the repository root
cd ccip-sdk-examples

# Install all dependencies
pnpm install

# Build shared packages (required for all examples)
pnpm build:packages
```

## Running the App

```bash
# Start the development server
pnpm dev:02
```

Open http://localhost:5173 in your browser.

## Using the Bridge

### Step 1: Connect Your Wallet

Click "Connect Wallet" and select your wallet provider. Approve the connection in your wallet.

### Step 2: Configure the Transfer

1. **From Network**: Select the source chain (where your tokens are)
2. **To Network**: Select the destination chain
3. **Fee Token**: Choose which token to pay CCIP fees in (available options discovered from the router)
4. **Amount**: Enter how many CCIP-BnM tokens to transfer

Your CCIP-BnM balance is displayed once you select a source network. Available fee tokens (native currency plus any ERC-20 fee tokens from the router) are listed with their balances. A fee token is disabled if the wallet balance is zero.

### Step 3: Switch Networks (if needed)

If your wallet is on a different network than the source, click "Switch to [Network]" to change.

### Step 4: Estimate Fee

Click "Estimate Fee" to see the CCIP fee (in the selected fee token) and the estimated delivery time. The fee amount varies depending on the selected fee token.

### Step 5: Execute Transfer

Click "Transfer" and approve the transactions in your wallet:

1. **Token Approval** (if needed): Allows CCIP Router to spend your tokens
2. **CCIP Send**: Initiates the cross-chain transfer

### Step 6: Track Your Transfer

After the transaction confirms:

- View the estimated delivery time (from `getLaneLatency`)
- Track cross-chain progress via the live stepper and [CCIP Explorer](https://ccip.chain.link)

## Project Structure

This example is part of a monorepo. Local code lives in `src/`, while shared packages provide reusable hooks, components, and configuration.

```
src/
├── components/
│   ├── bridge/
│   │   ├── BridgeForm.tsx       # Main transfer form (local)
│   │   └── WalletConnect.tsx    # RainbowKit connect button (local)
│   └── layout/
│       └── Footer.tsx           # Footer (local; Header from shared-components)
├── config/
│   └── index.ts                 # Re-exports wagmi config from shared-config
├── hooks/
│   ├── index.ts                 # Re-exports local + shared hooks
│   ├── useTransfer.ts           # Transfer execution logic (local)
│   └── useGetChain.ts           # SDK chain instance factory (local)
├── App.tsx                      # Main app with providers
└── main.tsx                     # Entry point
```

**From shared packages** (via `@ccip-examples/*`):

| Import                                                  | Package               | Purpose                   |
| ------------------------------------------------------- | --------------------- | ------------------------- |
| `TransferStatus`, `MessageProgress`, `Header`           | `shared-components`   | UI components             |
| `Select`, `Input`, `Button`, `Alert`                    | `shared-components`   | Form primitives           |
| `FeeTokenOptions`, `FeeEstimateDisplay`, `BalancesList` | `shared-components`   | Bridge UI widgets         |
| `globals.css`, `*.module.css`                           | `shared-components`   | Styles                    |
| `useWalletBalances`, `useFeeTokens`                     | `shared-utils/hooks`  | Balance & fee token hooks |
| `useMessageStatus`                                      | `shared-utils/hooks`  | CCIP message tracking     |
| `buildTokenTransferMessage`, `toGenericPublicClient`    | `shared-utils`        | SDK helpers               |
| `wagmiConfig`, `NETWORK_TO_CHAIN_ID`                    | `shared-config/wagmi` | Wagmi setup               |
| `NETWORKS`, `getTokenAddress`                           | `shared-config`       | Network & token config    |

## Key Concepts

### Wagmi + Viem + RainbowKit

This example uses the modern EVM wallet stack:

- **wagmi**: React hooks for wallet state management
- **viem**: Low-level Ethereum primitives
- **RainbowKit**: Beautiful wallet connection UI

### CCIP SDK Integration

The SDK integrates with viem via adapters:

```typescript
import { fromViemClient, viemWallet } from "@chainlink/ccip-sdk/viem";
import { CCIPAPIClient, networkInfo } from "@chainlink/ccip-sdk";
import {
  buildTokenTransferMessage,
  toGenericPublicClient,
  categorizeError,
} from "@ccip-examples/shared-utils";

// Create SDK chain from wagmi's public client
const publicClient = getPublicClient(wagmiConfig, { chainId });
const chain = await fromViemClient(toGenericPublicClient(publicClient));

// Destination selector from static metadata (no RPC call)
const destChainSelector = networkInfo(destNetworkId).chainSelector;

// Build message with fee token
const message = buildTokenTransferMessage({
  receiver,
  tokenAddress,
  amount,
  feeToken: feeTokenAddress, // omit or undefined for native currency
});

// Get fee + estimated delivery time
const [fee, latency] = await Promise.all([
  chain.getFee({ router, destChainSelector, message }),
  chain.getLaneLatency(destChainSelector),
]);
console.log(`Fee: ${fee}, Delivery: ~${Math.round(latency.totalMs / 60000)} min`);

// Send message (SDK handles approval + transaction)
const request = await chain.sendMessage({
  router,
  destChainSelector,
  message: { ...message, fee },
  wallet: viemWallet(walletClient),
});
console.log(request.tx.hash, request.message.messageId);

// Track status — via CCIPAPIClient
const api = new CCIPAPIClient();
const result = await api.getMessageById(request.message.messageId);
console.log(result.metadata.status);

// Error handling — categorizeError leverages SDK error types
try {
  /* ... */
} catch (err) {
  const family = networkInfo(sourceNetwork).family;
  const categorized = categorizeError(err, { chainFamily: family });
  console.log(categorized.message, categorized.category, categorized.severity);
}
```

### Network Configuration

Network IDs use SDK-compatible format (e.g., `"ethereum-testnet-sepolia"`).
Chain IDs and selectors are fetched from the SDK, not hardcoded.

## Troubleshooting

### "Network not configured in wagmi"

The selected network isn't configured in the wagmi setup (`packages/shared-config/src/wagmi.ts`). This example supports Sepolia, Base Sepolia, and Avalanche Fuji.

### "Token not available on this network"

CCIP-BnM tokens have specific addresses per network. Make sure you're using a supported network.

### Transaction stuck or failed

- Ensure you have enough native tokens for gas
- Check that you have CCIP-BnM tokens on the source chain
- Try increasing gas limit in your wallet

### Transfer taking too long

CCIP transfers involve multiple steps:

1. Source chain finality (~2-3 minutes)
2. DON commits merkle root to destination
3. Risk Management Network blessing
4. Execution on destination

The estimated delivery time shown in the UI comes from `getLaneLatency()` and varies by lane. Check the CCIP Explorer for real-time progress.

## Learn More

- [CCIP Documentation](https://docs.chain.link/ccip)
- [CCIP SDK](https://www.npmjs.com/package/@chainlink/ccip-sdk)
- [wagmi Documentation](https://wagmi.sh)
- [RainbowKit Documentation](https://www.rainbowkit.com)
- [viem Documentation](https://viem.sh)
