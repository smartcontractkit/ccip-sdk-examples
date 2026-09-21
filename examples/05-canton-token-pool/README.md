# 05 - Canton Token Pool (CCT)

> **CCIP SDK** [`@chainlink/ccip-sdk`](https://www.npmjs.com/package/@chainlink/ccip-sdk) | **Testnet only** | [CCIP Docs](https://docs.chain.link/ccip) | [CCIP Explorer](https://ccip.chain.link)

> **Disclaimer**
>
> _This tutorial represents an educational example to use a Chainlink system, product, or service and is provided to demonstrate how to interact with Chainlink's systems, products, and services to integrate them into your own. This template is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, it has not been audited, and it may be missing key checks or error handling to make the usage of the system, product or service more clear. Do not use the code in this example in a production environment without completing your own audits and application of best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs that are generated due to errors in code._

Node.js scripts demonstrating the Cross-Chain Token (CCT) SDK surface for **Canton**: deploying
a token pool, validating its on-ledger wiring, and wiring the reverse lane on an EVM pool.

Unlike EVM/Solana, Canton writes are composed by the SDK but **signed externally** — the SDK
builds an unsigned transaction, and a wallet (via the [Wallet Gateway](https://docs.chain.link/ccip)
CIP-103 dApp API) signs and submits it. `deploy-pool.ts` demonstrates that full round-trip;
`validate-pool.ts` is read-only and needs no signing at all.

## Scripts

| Script | Description |
| --- | --- |
| `pnpm deploy` | Deploy a token pool in one atomic transaction (create + `Initialize`: TAR registration, lane wiring, 3 rate limiters, `SetPool`), then print the deployed state. |
| `pnpm validate` | Read-only, no wallet: 9 checks against a deployed pool — config, TAR registration, lane addresses + CCVs + limiter references, factory wiring, all 3 rate limiters. |
| `pnpm apply-evm-chain-updates` | Wire the reverse lane on the EVM-side TokenPool: `applyChainUpdates` with the Canton pool's derived remote address and instrument ID. |

## Setup

```bash
cp .env.example .env
# fill in CANTON_GATEWAY_URL, CANTON_GATEWAY_ACCESS_TOKEN, CANTON_INSTRUMENT_ID,
# CANTON_OBSERVERS, CANTON_REMOTE_CHAIN_SELECTOR, CANTON_REMOTE_TOKEN_ADDRESS,
# CANTON_REMOTE_POOLS, CANTON_CCV (see .env.example for the full list)
pnpm install
```

`CANTON_GATEWAY_ACCESS_TOKEN` is a pre-obtained JWT (session token or API key) for a
[Wallet Gateway](https://docs.chain.link/ccip) instance — no interactive browser login is
performed by these scripts.

## Deploy a pool

```bash
pnpm deploy
```

Prints an `approveUrl` — open it and approve in your wallet, then press Enter in the terminal
to continue. The script then reads back and prints the deployed pool's on-ledger state.

## Validate a deployment

```bash
pnpm validate
```

Exits `0` if all 9 checks pass, `1` otherwise. Safe to run against any already-deployed pool —
no wallet or signing required.

## Wire the EVM side

```bash
pnpm apply-evm-chain-updates
```

`applyChainUpdates` is `onlyOwner` on the EVM pool — `EVM_PRIVATE_KEY` must be the pool
owner's key. If `EVM_PRIVATE_KEY` is unset, prints the encoded calldata instead of sending
(dry run). The Canton-side remote pool/token addresses are derived automatically from
`CANTON_POOL_OWNER` + `CANTON_INSTRUMENT_ID` (override with `EVM_REMOTE_POOL_ADDRESS` /
`EVM_REMOTE_TOKEN_ADDRESS` if needed).
