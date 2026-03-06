# 03-multichain-bridge-dapp

Browser app: EVM, Solana, and Aptos transfers using [@chainlink/ccip-sdk](https://www.npmjs.com/package/@chainlink/ccip-sdk) (v1.0.0). Testnet only. Same layout and shared packages as 02, with Solana, Aptos, transaction history, pool info, and rate limits.

**Send flow (difference from 02):** This app does **not** use `chain.sendMessage()`. It uses `chain.generateUnsignedSendMessage()` to build unsigned transaction data, then passes that to the connected wallet (EVM, Solana, or Aptos) for signing and sending via `sendTransaction`. 02 uses `sendMessage()`, which lets the SDK handle approval and send in one call. The unsigned-tx pattern here is required for Solana/Aptos and for explicit control over the sign/send step.

## Run

From repo root:

```bash
pnpm build:packages
pnpm dev:03
```

Open http://localhost:5173.

## Prerequisites

- Node.js 22+, pnpm 10+
- EVM wallet (e.g. MetaMask), Solana wallet (e.g. Phantom), and/or Aptos wallet (e.g. Petra)
- Testnet tokens: [CCIP Test Tokens](https://docs.chain.link/ccip/test-tokens)

Optional: copy `.env.example` to `.env`. Set `RPC_<NETWORK_ID>` (e.g. `RPC_ETHEREUM_TESTNET_SEPOLIA`, `RPC_SOLANA_DEVNET`) to override public RPC URLs. Set `VITE_WALLETCONNECT_PROJECT_ID` for WalletConnect.

## Architecture

- **Chains:** `ChainContext` exposes `getChain(networkId)`. Chains are created on demand via the shared `createChain(networkId, rpcUrl)` factory from `@ccip-examples/shared-utils`, which maps chain family to the appropriate SDK constructor (`EVMChain.fromUrl`, `SolanaChain.fromUrl`, `AptosChain.fromUrl`). RPC URLs come from `NETWORKS[networkId].rpcUrl` in shared-config (env override or fallback).
- **Chain family:** `networkInfo(networkId).family` (SDK); no custom chain-type strings.
- **Provider order:** ErrorBoundary → QueryClientProvider → WagmiProvider → RainbowKitProvider → ConnectionProvider (Solana) → WalletProvider (Solana) → WalletModalProvider → AptosWalletAdapterProvider → ChainContextProvider → TransactionHistoryProvider → App.
- **Config:** `@ccip-examples/shared-config` (NETWORKS, tokens, wagmi); SDK network IDs only (e.g. `ethereum-testnet-sepolia`, `solana-devnet`, `aptos-testnet`).

## Data flow

| Step | Component                                             | Role                                                                                                                                          |
| ---- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | WalletConnect                                         | EVM (RainbowKit), Solana (WalletMultiButton), and/or Aptos (custom connect button)                                                            |
| 2    | BridgeForm                                            | Source/dest (all networks), fee token (native or LINK), amount, receiver                                                                      |
| 3    | useWalletBalances                                     | Native, LINK, and token balances via `getChain(networkId).getBalance`                                                                         |
| 4    | PoolInfo                                              | Pool and rate limits via `useTokenPoolInfo`: `getTokenAdminRegistryFor`, `getRegistryTokenConfig`, `getTokenPoolConfig`, `getTokenPoolRemote` |
| 5    | useTransfer                                           | Estimate fee (with feeToken param) + lane latency; delegates send to useTransactionExecution                                                  |
| 6    | useEVMTransfer / useSolanaTransfer / useAptosTransfer | `generateUnsignedSendMessage` + wallet `sendTransaction`                                                                                      |
| 7    | TransactionHistoryProvider                            | Append tx to history; poll status in parallel with AbortController                                                                            |
| 8    | useMessageStatus                                      | Poll CCIP API (`getMessageById`) for message status                                                                                           |
| 9    | MessageProgress                                       | Stepper UI until success/failed                                                                                                               |

## Cross-family behavior

- **EVM ↔ EVM:** One EVM wallet; switch chain when source ≠ current chain (Sepolia, Base Sepolia, Fuji).
- **EVM ↔ Solana:** Connect the wallet for the **source** network. Receiver must be valid for the **destination** (EVM 0x… or Solana base58).
- **EVM ↔ Aptos:** Connect the wallet for the **source** network. Receiver must be valid for the **destination** (EVM 0x… or Aptos 0x…).
- **Solana ↔ Aptos:** Connect both wallets. Receiver must be valid for the destination chain family.
- **Validation:** `isValidAddress(receiver, networkInfo(destNetworkId).family)` (shared-utils) handles all families.
- **Pools:** Not every token is enabled on every lane. PoolInfo shows support and rate limits; unsupported lanes show "Lane Not Supported."

## SDK Inspector

The app includes an SDK Inspector panel (toggle via the `</>` button) that visualizes every CCIP SDK call in real time, grouped into four phases: **Setup**, **Fee Estimation**, **Transfer**, and **Tracking**. Each entry shows the method name, arguments, result, latency, and an educational annotation explaining _what_ the call does and _why_ it happens at that point in the flow.

The inspector is **optional instrumentation** layered on top of the SDK calls -- it does not change the SDK's behavior or API surface. If you are reading the source code to learn how to build your own frontend, here is how to navigate it:

### Reading through the inspector code

SDK calls in hooks like `useTransfer.ts` are wrapped in `logSDKCall()`:

```ts
// The wrapper adds inspector instrumentation around the SDK call.
// The actual SDK usage is always the second argument (the lambda).
const tokenInfo = await logSDKCall(
  { method: "chain.getTokenInfo", phase: "estimation", ... },
  () => chain.getTokenInfo(tokenAddress)  // <-- this is the SDK call
);
```

To extract the SDK pattern, read the lambda. The config object above it (`method`, `phase`, `displayArgs`, `annotation`) is purely for the inspector UI.

### What you can ignore

| File / directory                         | Purpose                                  | Needed for your app? |
| ---------------------------------------- | ---------------------------------------- | -------------------- |
| `src/inspector/`                         | Inspector store, annotations, re-exports | No                   |
| `logSDKCall` / `logSDKCallSync` wrappers | Record calls to the inspector            | No                   |
| `getAnnotation(...)`                     | Educational text for each method         | No                   |
| `displayArgs` in hook calls              | Badge labels shown in the inspector      | No                   |

### What to focus on

| File                         | What it teaches                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `hooks/useTransfer.ts`       | End-to-end transfer flow: `networkInfo` → `getTokenInfo` → `getFee` → `getLaneLatency` → `generateUnsignedSendMessage` |
| `hooks/useEVMTransfer.ts`    | EVM-specific signing: approval txs, simulation, `sendTransaction`, `getMessagesInTx`                                   |
| `hooks/useSolanaTransfer.ts` | Solana-specific signing: `VersionedTransaction`, wallet adapter `sendTransaction`                                      |
| `hooks/useAptosTransfer.ts`  | Aptos-specific signing: `signAndSubmitTransaction`, transaction polling                                                |
| `hooks/useTokenPoolInfo.ts`  | Token pool discovery: registry → pool config → remote token + rate limits                                              |
| `hooks/ChainContext.tsx`     | Lazy chain instantiation: `EVMChain.fromUrl` / `SolanaChain.fromUrl` / `AptosChain.fromUrl`                            |

Every SDK call in these files follows the same pattern: strip the `logSDKCall` wrapper and you have production-ready code.

## Concepts

- **Network IDs:** SDK format only (e.g. `ethereum-testnet-sepolia`, `solana-devnet`, `aptos-testnet`).
- **Fee token selection:** Users choose a fee token via `FeeTokenOptions` (native currency, LINK, or other tokens discovered from the router). Each option shows the token name, symbol, balance, and a "Native" badge for native currency. The address is passed to `buildTokenTransferMessage({ ..., feeToken })`.
- **Balances:** `useWalletBalances` fetches native, LINK (if available), and transfer token balances in parallel. Displayed via `BalancesList` component.
- **Fees:** `getFee()` and `getLaneLatency()` on source chain. Fee amount depends on the selected fee token.
- **History:** Stored in localStorage; pending items polled with AbortController; open via header **History** button.
- **Errors:** User-facing text from `categorizeError` (shared-utils), which leverages `CCIPError.isCCIPError`, `EVMChain.parse`, `SolanaChain.parse`, and `AptosChain.parse` from the SDK, plus pattern matching for wallet rejections and network errors.
