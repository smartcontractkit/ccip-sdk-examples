# 04 - Hardhat v3 + CCIP SDK

> **CCIP SDK** [`@chainlink/ccip-sdk@1.2.0`](https://www.npmjs.com/package/@chainlink/ccip-sdk/v/1.2.0) | **Testnet only** | [CCIP Docs](https://docs.chain.link/ccip) | [CCIP Explorer](https://ccip.chain.link)

> **Disclaimer**
>
> _This tutorial represents an educational example to use a Chainlink system, product, or service and is provided to demonstrate how to interact with Chainlink's systems, products, and services to integrate them into your own. This template is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, it has not been audited, and it may be missing key checks or error handling to make the usage of the system, product or service more clear. Do not use the code in this example in a production environment without completing your own audits and application of best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs that are generated due to errors in code._

Examples 01–03 use the SDK as the entire execution layer — `chain.sendMessage()` handles approvals, message building, and `ccipSend` with no custom contracts.

This example uses custom sender and receiver contracts for the on-chain execution, and the SDK for offchain operations: gas estimation, extraArgs encoding, fee calculation, message tracking, status monitoring, and manual execution of failed messages. It covers all three CCIP message types (token transfer, data-only, and programmable token transfer).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Hardhat v3 Tasks                                  │
│                                                                             │
│  deploy-sender    deploy-receiver    manage-allowlist   send-via-sender     │
│  send-via-router  check-status       check-inbox        manual-execute      │
│  list-messages    pause-contract     withdraw-funds     query-config        │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
┌──────────────────────┐ ┌──────────────────┐ ┌────────────────────────────┐
│    hre.artifacts     │ │  viem clients    │ │        CCIP SDK            │
│   .readArtifact()    │ │                  │ │  (@chainlink/ccip-sdk)     │
│                      │ │  publicClient    │ │                            │
│  CCIPSender ABI      │ │  walletClient    │ │  encodeExtraArgs()         │
│  CCIPReceiver ABI    │ │  erc20Abi        │ │  estimateReceiveExecution()│
│                      │ │                  │ │  getLaneLatency()          │
│                      │ │                  │ │  chain.execute()           │
│                      │ │                  │ │  searchMessages()          │
│                      │ │                  │ │  fromViemClient()          │
│                      │ │                  │ │  viemWallet()              │
│                      │ │                  │ │  getCCIPExplorerUrl()      │
│                      │ │                  │ │  CCIPAPIClient             │
└──────────────────────┘ └────────┬─────────┘ └──────────────┬─────────────┘
                                  │                          │
                                  ▼                          ▼
                         ┌─────────────────────────────────────────────┐
                         │              Blockchain RPCs                │
                         │                                             │
                         │  Source Chain          Destination Chain     │
                         │  ┌───────────┐        ┌───────────────┐    │
                         │  │CCIPSender │──CCIP──▶│CCIPReceiver   │    │
                         │  │ .send()   │        │ .ccipReceive()│    │
                         │  └───────────┘        └───────────────┘    │
                         └─────────────────────────────────────────────┘
```

## What You'll Learn

**CCIP contracts:**

- Deploy CCIP sender and receiver contracts with Hardhat v3
- Three message types: token transfer (TT), data-only (cross-chain inbox), programmable token transfer (PTT)
- Peer registration, double-mapping allowlist, defensive try/catch, Ownable2Step, Pausable, ReentrancyGuard

**SDK with custom contracts:**

- Build `extraArgs` offchain via `encodeExtraArgs()` and pass them to your sender contract
- Estimate destination gas via `estimateReceiveExecution()`
- Estimate CCIP fees offchain via `getFee()`
- Extract the messageId from transaction logs via `getMessagesInTx()`
- Track delivery status, search messages, and query lane latency

**SDK without contracts (direct router):**

- Send via `sendMessage()` — the SDK handles approvals and `ccipSend`

**Failure handling:**

- Manual execution of failed messages via `chain.execute()` with auto gas estimation
- Recover tokens stuck in the receiver contract after processing failures
- Query failed message status and contract configuration

## Smart Contracts

### CCIPSender

A sender contract that accepts pre-encoded `extraArgs` from offchain code. The SDK builds the `extraArgs` offchain; the contract forwards them to the router unchanged.

| Pattern                 | Description                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Peer registration       | `setPeer(destChainSelector, receiver)` — owner registers trusted (chain, receiver) pairs. `setPeers()` for batch. Sends to unregistered destinations revert. |
| Fee token deduplication | When the fee token (e.g., LINK) is the same as a transfer token, the contract combines into a single `transferFrom` + `approve` instead of two.              |
| Excess native refund    | If `msg.value` exceeds the actual CCIP fee, the excess is returned to the caller.                                                                            |
| Ownable2Step            | Two-step ownership transfer — new owner must call `acceptOwnership()`.                                                                                       |
| Pausable                | Owner can halt all sends via `pause()`.                                                                                                                      |
| ReentrancyGuard         | Prevents reentrancy via malicious ERC20 token callbacks.                                                                                                     |
| SafeERC20               | Handles non-standard ERC20 tokens (e.g., USDT).                                                                                                              |
| Recovery                | `withdraw()` for native, `withdrawToken(beneficiary, token, amount)` for ERC20.                                                                              |

### CCIPReceiverExample

A receiver contract that handles three message modes using the defensive pattern from the [Chainlink CCIP best practices](https://docs.chain.link/ccip/best-practices).

| Pattern                  | Description                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Defensive try/catch      | `_ccipReceive` wraps `processMessage()` in try/catch. If processing fails, tokens stay in the contract and the `messageId` is recorded in `failedMessages`. Owner recovers via `withdrawToken()`. |
| Double-mapping allowlist | `allowlistedSenders[sourceChainSelector][sender]` — prevents a contract on chain B from impersonating an allowlisted sender on chain A. `updateAllowlist()` for batch add/remove.                 |
| onlySelf modifier        | `processMessage()` is `external` (required for try/catch) but restricted to `address(this)`.                                                                                                      |
| Pausable                 | When paused, `_ccipReceive` reverts. CCIP marks the message as failed — it can be manually re-executed via the CCIP explorer once unpaused.                                                       |
| Ownable2Step             | Same as sender.                                                                                                                                                                                   |
| ReentrancyGuard          | Same as sender.                                                                                                                                                                                   |
| Recovery                 | `withdrawToken(beneficiary, token, amount)` — pass a specific amount to recover tokens from individual failed messages, or 0 for full balance.                                                    |

**Message modes:**

| Mode                | Condition                                         | Behavior                                                                                                                                     |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Token-only (TT)     | `data.length == 0`, `destTokenAmounts.length > 0` | Holds tokens in contract. Emits `TokensReceived`.                                                                                            |
| Data-only (Inbox)   | `data.length > 0`, `destTokenAmounts.length == 0` | Stores message in on-chain `inbox` array (sender, source chain, data, timestamp). Queryable via `getLatestMessages()`. Emits `DataReceived`. |
| Data + Tokens (PTT) | `data.length > 0`, `destTokenAmounts.length > 0`  | Decodes a `recipient` address from `data`, forwards tokens to that address via `safeTransfer`. Emits `TokensForwarded`.                      |

## Prerequisites

### Node.js Version

**Node.js v22+** is required. Use [nvm](https://github.com/nvm-sh/nvm) to manage versions:

```bash
nvm install 22
nvm use 22
node --version  # Should show v22.x.x
```

### pnpm Package Manager

```bash
npm install -g pnpm
```

### Configured Networks

| Network ID                        | Chain            |
| --------------------------------- | ---------------- |
| `ethereum-testnet-sepolia`        | Ethereum Sepolia |
| `ethereum-testnet-sepolia-base-1` | Base Sepolia     |
| `avalanche-testnet-fuji`          | Avalanche Fuji   |

These are the values used in `--network` and `--dest`/`--chains` flags throughout all tasks.

### Testnet Tokens

| What                                  | Where                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| Sepolia ETH (gas)                     | [Chainlink Faucet](https://faucets.chain.link/sepolia)       |
| Base Sepolia ETH (gas)                | [Chainlink Faucet](https://faucets.chain.link/base-sepolia)  |
| CCIP-BnM (transfer token)             | [CCIP Test Tokens](https://docs.chain.link/ccip/test-tokens) |
| LINK (optional, for LINK fee payment) | [Chainlink Faucet](https://faucets.chain.link/)              |

## Installation

```bash
# From the repository root
cd ccip-sdk-examples

# Install all dependencies
pnpm install

# Build shared packages (required for all examples)
pnpm build:packages
```

## Quick Start

```bash
cd examples/04-hardhat-ccip

# Copy environment file
cp .env.example .env
# Edit .env:
#   EVM_PRIVATE_KEY=<your private key>
#   RPC_ETHEREUM_TESTNET_SEPOLIA=<optional, public fallback used if unset>
#   RPC_ETHEREUM_TESTNET_SEPOLIA_BASE_1=<optional>
#   RPC_AVALANCHE_TESTNET_FUJI=<optional>

# Compile contracts
pnpm build

# Deploy receiver on Base Sepolia
npx hardhat --network ethereum-testnet-sepolia-base-1 deploy-receiver

# Deploy sender on Sepolia, register receiver as peer
npx hardhat --network ethereum-testnet-sepolia deploy-sender \
  --peer-chain ethereum-testnet-sepolia-base-1 \
  --peer-address <RECEIVER_ADDRESS>

# Allowlist the sender on the existing receiver
npx hardhat --network ethereum-testnet-sepolia-base-1 manage-allowlist \
  --contract <RECEIVER_ADDRESS> --type receiver \
  --chains ethereum-testnet-sepolia \
  --senders <SENDER_ADDRESS>

# Send a token transfer through the sender contract
npx hardhat --network ethereum-testnet-sepolia send-via-sender \
  --dest ethereum-testnet-sepolia-base-1 \
  --sender-contract <SENDER_ADDRESS> \
  --receiver <RECEIVER_ADDRESS> \
  --mode tt --amount 0.001 --token CCIP-BnM

# Check status
npx hardhat check-status --message-id <MESSAGE_ID>
```

## Hardhat Tasks

### `deploy-sender`

Deploys `CCIPSender` with the network's CCIP router. Can register a peer at deploy time.

```bash
# Deploy only
npx hardhat --network ethereum-testnet-sepolia deploy-sender

# Deploy and register a peer
npx hardhat --network ethereum-testnet-sepolia deploy-sender \
  --peer-chain ethereum-testnet-sepolia-base-1 \
  --peer-address 0x...
```

| Flag             | Description                                | Default |
| ---------------- | ------------------------------------------ | ------- |
| `--peer-chain`   | Destination chain to register (network ID) | —       |
| `--peer-address` | Trusted receiver address on that chain     | —       |

### `deploy-receiver`

Deploys `CCIPReceiverExample` with the network's CCIP router. Can allowlist a source chain + sender at deploy time.

```bash
# Deploy only
npx hardhat --network ethereum-testnet-sepolia-base-1 deploy-receiver

# Deploy and allowlist a sender
npx hardhat --network ethereum-testnet-sepolia-base-1 deploy-receiver \
  --allowlist-chain ethereum-testnet-sepolia \
  --allowlist-sender 0x...
```

| Flag                 | Description                               | Default |
| -------------------- | ----------------------------------------- | ------- |
| `--allowlist-chain`  | Source chain to allowlist (network ID)    | —       |
| `--allowlist-sender` | Sender address to allowlist on that chain | —       |

### `manage-allowlist`

Manages allowlists on deployed `CCIPSender` (peers) or `CCIPReceiverExample` (senders) contracts. Supports single and batch operations.

```bash
# Sender: register a peer
npx hardhat --network ethereum-testnet-sepolia manage-allowlist \
  --contract 0x... --type sender \
  --chains ethereum-testnet-sepolia-base-1 --peers 0x...

# Receiver: batch allowlist (comma-separated chains and senders)
npx hardhat --network ethereum-testnet-sepolia-base-1 manage-allowlist \
  --contract 0x... --type receiver \
  --chains ethereum-testnet-sepolia,avalanche-testnet-fuji \
  --senders 0x...,0x...

# Remove from allowlist
npx hardhat --network ethereum-testnet-sepolia manage-allowlist \
  --contract 0x... --type sender \
  --chains ethereum-testnet-sepolia-base-1 --peers 0x... --remove true
```

| Flag         | Description                                      | Default |
| ------------ | ------------------------------------------------ | ------- |
| `--contract` | Deployed contract address                        | —       |
| `--type`     | Contract type: `sender` or `receiver`            | —       |
| `--chains`   | Comma-separated chain network IDs                | —       |
| `--peers`    | Comma-separated peer addresses (sender type)     | —       |
| `--senders`  | Comma-separated sender addresses (receiver type) | —       |
| `--remove`   | Set to `true` to remove from allowlist           | —       |

### `send-via-sender`

Sends a CCIP message through a deployed `CCIPSender` contract. The SDK builds `extraArgs` offchain, the contract forwards them to the router.

Gas limit is auto-estimated via `estimateReceiveExecution()` for `data` and `ptt` modes. Override with `--gas-limit`.

```bash
# Token transfer (TT) — gasLimit defaults to 0 (no data to process)
npx hardhat --network ethereum-testnet-sepolia send-via-sender \
  --dest ethereum-testnet-sepolia-base-1 \
  --sender-contract 0x... --receiver 0x... \
  --mode tt --amount 0.001 --token CCIP-BnM

# Data-only — gasLimit auto-estimated
npx hardhat --network ethereum-testnet-sepolia send-via-sender \
  --dest ethereum-testnet-sepolia-base-1 \
  --sender-contract 0x... --receiver 0x... \
  --mode data

# Programmable token transfer (PTT) — gasLimit auto-estimated
npx hardhat --network ethereum-testnet-sepolia send-via-sender \
  --dest ethereum-testnet-sepolia-base-1 \
  --sender-contract 0x... --receiver 0x... \
  --mode ptt --amount 0.001 --token CCIP-BnM
```

| Flag                | Description                        | Default    |
| ------------------- | ---------------------------------- | ---------- |
| `--dest`            | Destination network ID             | —          |
| `--sender-contract` | Deployed CCIPSender address        | —          |
| `--receiver`        | Receiver address on destination    | —          |
| `--mode`            | `tt`, `data`, or `ptt`             | —          |
| `--amount`          | Token amount (for tt/ptt)          | `0`        |
| `--token`           | Token key                          | `CCIP-BnM` |
| `--fee-token`       | `native` or `link`                 | `native`   |
| `--gas-limit`       | Override auto-estimated gas limit  | `0` (auto) |
| `--data`            | Hex-encoded data payload (for ptt) | —          |

### `send-via-router`

Sends a CCIP message directly through the router using the SDK. No custom sender contract. The SDK builds the message, handles token approvals, and calls `ccipSend`.

```bash
# Token transfer
npx hardhat --network ethereum-testnet-sepolia send-via-router \
  --dest ethereum-testnet-sepolia-base-1 \
  --receiver 0x... --mode tt --amount 0.001 --token CCIP-BnM

# Data-only
npx hardhat --network ethereum-testnet-sepolia send-via-router \
  --dest ethereum-testnet-sepolia-base-1 \
  --receiver 0x... --mode data

# PTT
npx hardhat --network ethereum-testnet-sepolia send-via-router \
  --dest ethereum-testnet-sepolia-base-1 \
  --receiver 0x... --mode ptt --amount 0.001 --token CCIP-BnM
```

| Flag          | Description                        | Default    |
| ------------- | ---------------------------------- | ---------- |
| `--dest`      | Destination network ID             | —          |
| `--receiver`  | Receiver address on destination    | —          |
| `--mode`      | `tt`, `data`, or `ptt`             | —          |
| `--amount`    | Token amount (for tt/ptt)          | `0`        |
| `--token`     | Token key                          | `CCIP-BnM` |
| `--fee-token` | `native` or `link`                 | `native`   |
| `--gas-limit` | Override auto-estimated gas limit  | `0` (auto) |
| `--data`      | Hex-encoded data payload (for ptt) | —          |

### `check-status`

Checks CCIP message delivery status via the CCIP API. Retries automatically with exponential backoff.

```bash
npx hardhat check-status --message-id 0x...
```

### `check-inbox`

Reads the on-chain inbox from a deployed `CCIPReceiverExample`. Data-only messages are stored in the contract's `inbox` array with sender, source chain, data, and timestamp.

```bash
# Show last 5 messages (default)
npx hardhat --network ethereum-testnet-sepolia-base-1 check-inbox \
  --receiver-contract 0x...

# Show last 10 messages
npx hardhat --network ethereum-testnet-sepolia-base-1 check-inbox \
  --receiver-contract 0x... --count 10

# Look up a specific message by ID
npx hardhat --network ethereum-testnet-sepolia-base-1 check-inbox \
  --receiver-contract 0x... --message-id 0x...
```

| Flag                  | Description                          | Default |
| --------------------- | ------------------------------------ | ------- |
| `--receiver-contract` | Deployed CCIPReceiverExample address | —       |
| `--count`             | Number of latest messages to show    | `5`     |
| `--message-id`        | Look up a specific message by ID     | —       |

### `manual-execute`

Manually re-executes a failed CCIP message on the destination chain. The SDK fetches merkle proofs and offchain token data from the CCIP API, then submits the execution transaction.

When `--gas-limit` is not provided, the task estimates gas via `estimateReceiveExecution()` and adds a 10% margin.

```bash
# Re-execute a failed message (gas auto-estimated)
npx hardhat --network ethereum-testnet-sepolia-base-1 manual-execute \
  --message-id 0x...

# With a manual gas limit override
npx hardhat --network ethereum-testnet-sepolia-base-1 manual-execute \
  --message-id 0x... --gas-limit 300000
```

| Flag           | Description                        | Default    |
| -------------- | ---------------------------------- | ---------- |
| `--message-id` | CCIP message ID to execute         | —          |
| `--gas-limit`  | Gas limit override for ccipReceive | `0` (auto) |

**Simulating a failure for testing:**

```bash
# 1. Send a data-only message with a deliberately low gas limit
npx hardhat --network ethereum-testnet-sepolia send-via-router \
  --dest ethereum-testnet-sepolia-base-1 \
  --receiver 0x... --mode data --gas-limit 1000

# 2. The message will fail on destination (out of gas)
# 3. Wait for it to become eligible for manual execution (~20 min)
npx hardhat check-status --message-id 0x...

# 4. Re-execute with a proper gas limit
npx hardhat --network ethereum-testnet-sepolia-base-1 manual-execute \
  --message-id 0x... --gas-limit 300000
```

### `list-messages`

Searches CCIP messages using the SDK's `searchAllMessages()` async generator. Handles pagination automatically.

```bash
# List recent messages (default: 10)
npx hardhat list-messages

# Filter by sender address
npx hardhat list-messages --sender 0x...

# Filter by source and destination chain
npx hardhat list-messages \
  --source-chain ethereum-testnet-sepolia \
  --dest-chain ethereum-testnet-sepolia-base-1

# Filter by source transaction hash
npx hardhat list-messages --tx-hash 0x...

# Show only messages ready for manual execution
npx hardhat list-messages --ready-for-exec true

# Fetch more results
npx hardhat list-messages --limit 25
```

| Flag               | Description                                   | Default |
| ------------------ | --------------------------------------------- | ------- |
| `--sender`         | Filter by sender address                      | —       |
| `--receiver`       | Filter by receiver address                    | —       |
| `--source-chain`   | Filter by source chain (network ID)           | —       |
| `--dest-chain`     | Filter by destination chain (network ID)      | —       |
| `--tx-hash`        | Filter by source transaction hash             | —       |
| `--ready-for-exec` | Show only messages ready for manual execution | —       |
| `--limit`          | Maximum number of messages to show            | `10`    |

### `pause-contract`

Pauses or unpauses a `CCIPSender` or `CCIPReceiverExample` contract. When paused, the sender reverts on `send()` and the receiver reverts on `_ccipReceive()` (CCIP marks the message as failed; it can be manually re-executed once unpaused).

```bash
# Pause sender contract
npx hardhat --network avalanche-testnet-fuji pause-contract \
  --contract 0x... --type sender --action pause

# Unpause receiver contract
npx hardhat --network ethereum-testnet-sepolia pause-contract \
  --contract 0x... --type receiver --action unpause
```

| Flag         | Description               | Default |
| ------------ | ------------------------- | ------- |
| `--contract` | Deployed contract address | —       |
| `--type`     | `sender` or `receiver`    | —       |
| `--action`   | `pause` or `unpause`      | —       |

### `withdraw-funds`

Withdraws native currency or ERC20 tokens from a contract.

```bash
# Withdraw native currency
npx hardhat --network avalanche-testnet-fuji withdraw-funds \
  --contract 0x... --type sender --beneficiary 0x...

# Withdraw ERC20 tokens (full balance)
npx hardhat --network ethereum-testnet-sepolia withdraw-funds \
  --contract 0x... --type receiver --beneficiary 0x... --token 0x...

# Withdraw specific amount of ERC20 tokens
npx hardhat --network ethereum-testnet-sepolia withdraw-funds \
  --contract 0x... --type receiver --beneficiary 0x... --token 0x... --amount 1000000
```

| Flag            | Description                                | Default |
| --------------- | ------------------------------------------ | ------- |
| `--contract`    | Deployed contract address                  | —       |
| `--type`        | `sender` or `receiver`                     | —       |
| `--beneficiary` | Address to receive the withdrawn funds     | —       |
| `--token`       | ERC20 token address (omit for native)      | —       |
| `--amount`      | Amount in smallest unit (0 = full balance) | `0`     |

### `query-config`

Queries contract configuration: peer registration, allowlist status, failed messages, and pause state.

```bash
# Check if a peer is registered on sender
npx hardhat --network avalanche-testnet-fuji query-config \
  --contract 0x... --type sender --query peer \
  --chain ethereum-testnet-sepolia

# Check if a sender is allowlisted on receiver
npx hardhat --network ethereum-testnet-sepolia query-config \
  --contract 0x... --type receiver --query allowlist \
  --chain avalanche-testnet-fuji --address 0x...

# Check if a message failed on receiver
npx hardhat --network ethereum-testnet-sepolia query-config \
  --contract 0x... --type receiver --query failed \
  --message-id 0x...

# Check contract pause status and owner
npx hardhat --network ethereum-testnet-sepolia query-config \
  --contract 0x... --type receiver --query status
```

| Flag           | Description                                | Default |
| -------------- | ------------------------------------------ | ------- |
| `--contract`   | Deployed contract address                  | —       |
| `--type`       | `sender` or `receiver`                     | —       |
| `--query`      | `peer`, `allowlist`, `failed`, or `status` | —       |
| `--chain`      | Chain network ID (for peer/allowlist)      | —       |
| `--address`    | Sender address (for allowlist query)       | —       |
| `--message-id` | Message ID (for failed query)              | —       |

## Sending Patterns

### Pattern 1: Custom Contracts + SDK (`send-via-sender`)

```
   Offchain (SDK)                        On-chain (CCIPSender)
   ─────────────                         ─────────────────────

   estimateReceiveExecution()            function send(
     → gasLimit for ccipReceive            destChainSelector,
                                           receiver,
   encodeExtraArgs({                       data,
     gasLimit,                             tokenAmounts,
     allowOutOfOrderExecution              extraArgs,    ← passthrough
   }) → bytes extraArgs ─────────────▶    feeToken
                                         )
   getFee({ router, message })             │
     → estimated fee (display)             ▼
                                         router.ccipSend(
   getBalance(), getTokenInfo()            destChainSelector,
     → balance checks (display)            message ← extraArgs forwarded as-is
                                         )
   ─── after send ───

   getMessagesInTx(txHash)
     → messageId from logs

   CCIPAPIClient.getMessageById()
     → delivery status tracking

   chain.execute({ messageId })
     → manual re-execution if failed
```

The contract does not encode `extraArgs` itself. The SDK handles version-specific encoding (EVMExtraArgsV1, V2, GenericExtraArgsV3).

### Pattern 2: SDK Only (`send-via-router`, same as examples 01–03)

```
   Offchain (SDK)
   ─────────────
   chain = fromViemClient(publicClient)
   message = { receiver, data, tokenAmounts, extraArgs: { gasLimit } }
   fee = chain.getFee({ router, destChainSelector, message })
   result = chain.sendMessage({
     router, destChainSelector,
     message: { ...message, fee },
     wallet: viemWallet(walletClient)
   })
   // result.message.messageId — already parsed, no getMessagesInTx needed
```

### Comparison

| Consideration   | Pattern 1 (Custom Contracts)         | Pattern 2 (SDK Only)             |
| --------------- | ------------------------------------ | -------------------------------- |
| Access control  | On-chain `onlyOwner`, peer registry  | Wallet-level only                |
| Pausability     | On-chain `whenNotPaused`             | N/A                              |
| Fee management  | On-chain deduplication, refunds      | SDK handles                      |
| Token approvals | User approves the contract           | SDK approves the router directly |
| Upgradability   | Redeploy contract, re-register peers | Update the script                |
| Auditability    | Contract is on-chain, immutable      | Script can change                |

## Gas Estimation

Both send tasks auto-estimate `gasLimit` for `data` and `ptt` modes using `estimateReceiveExecution()`. Steps:

1. Resolves onRamp and offRamp addresses from the router
2. Maps source token addresses to destination token addresses
3. Builds `eth_estimateGas` `stateOverride` with `stateDiff` entries that set the receiver's token balances as if the OffRamp had already transferred them
4. Calls `eth_estimateGas` on the destination chain with `from: router, to: receiver, data: ccipReceive(message)` and the state overrides from step 3
5. Subtracts `(21,000 - 700)` to convert from transaction gas to internal CALL gas (21,000 is the base tx cost; 700 is the CALL opcode cost)
6. The task adds a 10% safety margin to the estimate

For token-only transfers (`tt` mode), gasLimit is 0 — the SDK defaults to 0 when there is no data payload.

## Lane Latency

Both send tasks call `getLaneLatency()` before sending to display the estimated delivery time. The SDK queries the CCIP API for historical lane latency data. If the API is unavailable, the send proceeds without an estimate.

## Key SDK Functions Used

| Function                           | Package                    | Used In                      | Description                                             |
| ---------------------------------- | -------------------------- | ---------------------------- | ------------------------------------------------------- |
| `encodeExtraArgs()`                | `@chainlink/ccip-sdk`      | send-via-sender              | Encode gasLimit + flags into bytes for the router       |
| `estimateReceiveExecution()`       | `@chainlink/ccip-sdk`      | send-via-sender/router       | Simulate `ccipReceive` on destination to estimate gas   |
| `chain.getLaneLatency()`           | `@chainlink/ccip-sdk`      | send-via-sender/router       | Query historical lane latency from CCIP API             |
| `chain.sendMessage()`              | `@chainlink/ccip-sdk`      | send-via-router              | Build message, handle approvals, call `ccipSend`        |
| `chain.getFee()`                   | `@chainlink/ccip-sdk`      | send-via-router              | Get CCIP fee for a message                              |
| `chain.execute()`                  | `@chainlink/ccip-sdk`      | manual-execute               | Manually execute a failed message on destination        |
| `chain.estimateReceiveExecution()` | `@chainlink/ccip-sdk`      | manual-execute               | Estimate gas for `ccipReceive` on destination           |
| `chain.getMessagesInTx()`          | `@chainlink/ccip-sdk`      | send-via-sender              | Extract CCIP messages from a transaction                |
| `searchAllMessages()`              | `@chainlink/ccip-sdk`      | list-messages                | Async generator that paginates through CCIP API results |
| `getCCIPExplorerUrl()`             | `@chainlink/ccip-sdk`      | all tasks                    | Build CCIP Explorer URL for a message                   |
| `networkInfo()`                    | `@chainlink/ccip-sdk`      | deploy, list-messages        | Get chain selector and metadata for a network           |
| `fromViemClient()`                 | `@chainlink/ccip-sdk/viem` | send, manual-execute         | Create SDK chain instance from a viem PublicClient      |
| `viemWallet()`                     | `@chainlink/ccip-sdk/viem` | send, manual-execute         | Wrap viem WalletClient for SDK signing                  |
| `CCIPAPIClient`                    | `@chainlink/ccip-sdk`      | check-status, list, execute  | Query CCIP API for message status and search            |
| `withRetry()`                      | `@chainlink/ccip-sdk`      | check-status, manual-execute | Retry with exponential backoff and Retry-After          |

## Testing

Tests use [`@chainlink/local`](https://www.npmjs.com/package/@chainlink/local) which provides a `CCIPLocalSimulator` with a `MockRouter`. The mock router delivers CCIP messages in the same transaction.

```bash
pnpm test
```

Three test suites (28 tests total):

| Suite                  | Description                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `CCIPSender.test.ts`   | Unit tests: deployment, `setPeer`, `setPeers` batch, pause, access control, `withdraw`, `withdrawToken`                            |
| `CCIPReceiver.test.ts` | Unit tests: `allowlistSender`, `updateAllowlist` batch, pause, access control, `withdraw`, `withdrawToken`, `failedMessages` query |
| `Integration.test.ts`  | End-to-end via LocalSimulator: data-only, token-only, PTT, batch allowlist, defensive try/catch, sender allowlist rejection        |

## Solidity Linting

Contracts are linted with [solhint](https://protofire.github.io/solhint/):

- `solhint ^6.0.2` with the [`chainlink-solidity`](https://github.com/smartcontractkit/chainlink-solhint-rules) plugin (v1.2.1)
- Extends `solhint:recommended`
- Chainlink naming conventions: `i_` prefix for immutables, `_` prefix for internal/private functions, explicit returns
- Zero warnings tolerance (`--max-warnings 0`)

```bash
pnpm lint       # Runs both solhint and eslint
pnpm lint:fix   # Auto-fix both
```

## Project Structure

```
04-hardhat-ccip/
├── contracts/
│   ├── CCIPSender.sol              # Sender: peer registration, extraArgs passthrough, batch setPeers
│   ├── CCIPReceiver.sol            # Receiver: defensive try/catch, inbox, 3 message modes, batch updateAllowlist
│   └── test/
│       └── Setup.sol               # Re-exports CCIPLocalSimulator for test artifact generation
├── test/
│   ├── CCIPSender.test.ts          # Unit tests for sender contract
│   ├── CCIPReceiver.test.ts        # Unit tests for receiver contract
│   └── Integration.test.ts         # End-to-end tests with CCIPLocalSimulator
├── tasks/
│   ├── deploy-sender.ts            # Deploy + optional peer registration
│   ├── deploy-receiver.ts          # Deploy + optional sender allowlisting
│   ├── manage-allowlist.ts         # Manage peers (sender) or allowlist (receiver), single + batch
│   ├── send-via-sender.ts          # Send through sender contract (+ lane latency)
│   ├── send-via-router.ts          # Send directly via router (SDK) (+ lane latency)
│   ├── check-status.ts             # Track message delivery via CCIP API
│   ├── check-inbox.ts              # Read on-chain inbox from receiver contract
│   ├── manual-execute.ts           # Re-execute failed messages on destination (auto gas estimation)
│   ├── list-messages.ts            # Search messages with filters (async generator)
│   ├── pause-contract.ts           # Pause/unpause sender or receiver contracts
│   ├── withdraw-funds.ts           # Withdraw native or ERC20 tokens from contracts
│   └── query-config.ts             # Query peers, allowlist, failed messages, pause status
├── helpers/
│   └── sdk.ts                      # Shared SDK helpers (viem clients, router address)
├── hardhat.config.ts               # Hardhat v3 config (networks from shared-config)
├── .solhint.json                   # Chainlink-matching solhint rules
├── .env.example                    # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### "PeerNotRegistered"

No peer registered for the destination chain.

Register the peer before sending:

```bash
npx hardhat --network ethereum-testnet-sepolia deploy-sender \
  --peer-chain ethereum-testnet-sepolia-base-1 \
  --peer-address <RECEIVER_ADDRESS>
```

Or call `setPeer()` on an already-deployed sender contract.

### "SenderNotAllowed"

The receiver contract hasn't allowlisted the sender address for the source chain.

Allowlist the sender:

```bash
npx hardhat --network ethereum-testnet-sepolia-base-1 manage-allowlist \
  --contract <RECEIVER_ADDRESS> --type receiver \
  --chains ethereum-testnet-sepolia \
  --senders <SENDER_ADDRESS>
```

### "Insufficient balance" / "InsufficientNativeFee"

Not enough native tokens for gas or CCIP fees. Get testnet tokens from the faucets linked above.

### Gas estimation fails

The receiver contract isn't deployed, or the allowlist isn't configured. The SDK simulates `ccipReceive` on the destination contract — it must be deployed and configured.

### "Message not found" in check-status

CCIP messages take 20-40 seconds to be indexed by the API. The command retries with exponential backoff. If retries are exhausted, check the [CCIP Explorer](https://ccip.chain.link).

### Node.js version errors

Node.js v22+ required:

```bash
node --version  # Should be v22.x.x or higher
nvm use 22      # Switch if using nvm
```

## Note on Security

The contracts implement application-level patterns documented in the [CCIPSender](#ccipsender) and [CCIPReceiverExample](#ccipreceiverexample) sections above. Protocol-level protections (rate limiting, replay protection, multi-attestation via DON + RMN, block finality, decimal normalization) are handled by CCIP itself and are not reimplemented here.
