# Learning Path

Progressive examples for using `@chainlink/ccip-sdk` v1.0.0 (testnet only). Each example adds scope; shared packages provide config, utilities, UI, and brand assets.

## Example progression

### 01-getting-started

- **Runtime:** Node.js (no browser).
- **Purpose:** SDK basics without UI—chain setup, fee estimation, token discovery, pool inspection, cross-chain transfers.
- **Scripts:** `pnpm chains`, `pnpm fees`, `pnpm tokens`, `pnpm pools`, `pnpm transfer`, `pnpm status` (see example README).
- **Dependencies:** `@chainlink/ccip-sdk`, `@ccip-examples/shared-config`, `@ccip-examples/shared-utils` (chain factory, validation, message building).

### 02-evm-simple-bridge

- **Runtime:** Browser (Vite + React).
- **Purpose:** EVM-to-EVM transfer with a single wallet; fee estimate then send.
- **Send flow:** Calls `chain.sendMessage()`. The SDK performs approval (if needed) and send in one flow; wallet prompts are triggered inside the SDK.
- **Fee token:** User selects a fee token via `FeeTokenOptions` (native currency, LINK, or other tokens discovered dynamically from the router via `getFeeTokens()`). Each option shows token name, symbol, balance, and a "Native" badge for native currency.
- **Balances:** `useWalletBalances` fetches native, LINK, and token balances in parallel; displayed via `BalancesList`.
- **Stack:** wagmi, viem, RainbowKit; chain from `getPublicClient` + `fromViemClient(toGenericPublicClient(...))`.
- **Shared:** `@ccip-examples/shared-config` (NETWORKS, wagmi config, tokens), `@ccip-examples/shared-utils` (validation, errors, formatting, hooks), `@ccip-examples/shared-components` (Button, Input, Select, Alert, FeeTokenOptions, BalancesList, TransferStatus, MessageProgress, ErrorBoundary), `@ccip-examples/shared-brand` (design tokens, logo).
- **RPC:** Optional `.env` with `RPC_<NETWORK_ID>` (e.g. `RPC_ETHEREUM_TESTNET_SEPOLIA`) to override public RPC URLs.

### 03-multichain-bridge-dapp

- **Runtime:** Browser (Vite + React).
- **Purpose:** EVM, Solana, and Aptos; same app layout as 02 with lazy chain creation, transaction history, and pool/rate-limit UI.
- **Send flow:** Does **not** call `sendMessage()`. Calls `chain.generateUnsignedSendMessage()` to get unsigned transaction data, then passes it to the wallet (EVM, Solana, or Aptos) for signing and sending via `sendTransaction`. This pattern is required for Solana/Aptos and gives the app explicit control over the sign-and-send step.
- **Fee token:** Same as 02—user selects a fee token via `FeeTokenOptions`; fee tokens discovered dynamically from the router via `useFeeTokens` hook (`getFeeTokens()`).
- **Balances:** Same as 02—`useWalletBalances` (uses `ChainContext`) fetches native, LINK, and token balances.
- **Stack:** Same as 02 plus Solana wallet adapter and Aptos wallet adapter; `ChainContext` provides `getChain(networkId)` (EVM via wagmi/viem, Solana via `SolanaChain.fromUrl(rpcUrl)`, Aptos via `AptosChain.fromUrl(rpcUrl)`).
- **Shared:** Same packages as 02; chain family from `networkInfo(networkId).family` (no custom chain-type strings).
- **RPC:** Optional `.env` with `RPC_*` and `VITE_WALLETCONNECT_PROJECT_ID` (see example `.env.example`). Custom RPCs are used for all read operations; wallet only used for signing.

## Concepts

### Chain selectors vs chain IDs

CCIP routing uses **chain selectors** (64-bit identifiers), not wallet chain IDs.

- Chain ID: used by wallets (e.g. 11155111 for Sepolia).
- Chain selector: used by CCIP contracts and SDK (e.g. `16015286601757825753n` for Ethereum Sepolia). From SDK: `networkInfo(networkId).chainSelector`.

### Chain instances

- **EVM (browser):** `fromViemClient(toGenericPublicClient(viemPublicClient))` with SDK `EVMChain`; RPC comes from wagmi transport or `NETWORKS[networkId].rpcUrl` (env overrides via `getRpcUrl` in shared-config).
- **EVM (Node):** `EVMChain.fromRpc(networkId, rpcUrl)`.
- **Solana:** `SolanaChain.fromUrl(rpcUrl)`; `networkId` passed separately where needed.
- **Aptos:** `AptosChain.fromUrl(rpcUrl)`; `networkId` passed separately where needed.

### Fee estimation

Call `getFee()` on the source chain before sending. Message shape follows SDK `MessageInput` (receiver, tokenAmounts, feeToken, extraArgs, etc.). Use `buildTokenTransferMessage` (shared-utils) for token transfers:

```typescript
import { buildTokenTransferMessage } from "@ccip-examples/shared-utils";
import { resolveFeeTokenAddress } from "@ccip-examples/shared-config";

// feeToken: undefined = native currency, address = ERC20 (e.g. LINK)
const feeTokenAddress = resolveFeeTokenAddress("link", sourceNetworkId);

const message = buildTokenTransferMessage({
  receiver,
  tokenAddress,
  amount,
  feeToken: feeTokenAddress,
});

const fee = await chain.getFee({ router, destChainSelector, message });
```

## References

- [CCIP Documentation](https://docs.chain.link/ccip)
- [@chainlink/ccip-sdk](https://www.npmjs.com/package/@chainlink/ccip-sdk)
- [CCIP Explorer](https://ccip.chain.link)
