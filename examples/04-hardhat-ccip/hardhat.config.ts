import "dotenv/config";
import { defineConfig, configVariable, task } from "hardhat/config";
import hardhatViemPlugin from "@nomicfoundation/hardhat-viem";
import hardhatNodeTestRunnerPlugin from "@nomicfoundation/hardhat-node-test-runner";
import { NETWORKS, getChainIdForNetwork } from "@ccip-examples/shared-config";

// Build Hardhat network entries from shared-config NETWORKS (EVM only)
// Network names === CCIP SDK canonical networkIds — no mapping needed
const networks = Object.fromEntries(
  Object.entries(NETWORKS)
    .filter(([id]) => getChainIdForNetwork(id) !== undefined)
    .map(([id]) => [
      id,
      {
        type: "http" as const,
        url: configVariable(`RPC_${id.toUpperCase().replace(/-/g, "_")}`),
        accounts: [configVariable("EVM_PRIVATE_KEY")],
      },
    ])
);

// Register tasks
const tasks = [
  task("deploy-sender", "Deploy CCIPSender contract")
    .addOption({
      name: "peerChain",
      description: "Destination chain to register as peer (network ID)",
      defaultValue: "",
    })
    .addOption({
      name: "peerAddress",
      description: "Trusted receiver address on the peer chain",
      defaultValue: "",
    })
    .setAction(() => import("./tasks/deploy-sender.js"))
    .build(),

  task("deploy-receiver", "Deploy CCIPReceiverExample contract")
    .addOption({
      name: "allowlistChain",
      description: "Source chain to allowlist (network ID)",
      defaultValue: "",
    })
    .addOption({
      name: "allowlistSender",
      description: "Sender address to allowlist",
      defaultValue: "",
    })
    .setAction(() => import("./tasks/deploy-receiver.js"))
    .build(),

  task(
    "manage-allowlist",
    "Manage allowlist on CCIPSender (peers) or CCIPReceiverExample (senders)"
  )
    .addOption({
      name: "contract",
      description: "Deployed contract address",
      defaultValue: "",
    })
    .addOption({
      name: "type",
      description: "Contract type: sender or receiver",
      defaultValue: "",
    })
    .addOption({
      name: "chains",
      description: "Comma-separated chain network IDs",
      defaultValue: "",
    })
    .addOption({
      name: "peers",
      description: "Comma-separated peer addresses (for sender type)",
      defaultValue: "",
    })
    .addOption({
      name: "senders",
      description: "Comma-separated sender addresses (for receiver type)",
      defaultValue: "",
    })
    .addOption({
      name: "remove",
      description: "Set to 'true' to remove from allowlist",
      defaultValue: "",
    })
    .setAction(() => import("./tasks/manage-allowlist.js"))
    .build(),

  task("send-via-sender", "Send CCIP message through deployed sender contract")
    .addOption({ name: "dest", description: "Destination network ID", defaultValue: "" })
    .addOption({
      name: "senderContract",
      description: "Deployed CCIPSender address",
      defaultValue: "",
    })
    .addOption({
      name: "receiver",
      description: "Receiver address on destination",
      defaultValue: "",
    })
    .addOption({ name: "mode", description: "Message mode: tt, data, or ptt", defaultValue: "" })
    .addOption({
      name: "amount",
      description: "Token amount (for tt/ptt modes)",
      defaultValue: "0",
    })
    .addOption({
      name: "token",
      description: "Token key (e.g. CCIP-BnM)",
      defaultValue: "CCIP-BnM",
    })
    .addOption({
      name: "feeToken",
      description: "Fee payment: native or link",
      defaultValue: "native",
    })
    .addOption({ name: "gasLimit", description: "Dest execution gas limit", defaultValue: "0" })
    .addOption({ name: "data", description: "Hex-encoded data payload", defaultValue: "" })
    .setAction(() => import("./tasks/send-via-sender.js"))
    .build(),

  task("send-via-router", "Send CCIP message directly via router using SDK")
    .addOption({ name: "dest", description: "Destination network ID", defaultValue: "" })
    .addOption({
      name: "receiver",
      description: "Receiver address on destination",
      defaultValue: "",
    })
    .addOption({ name: "mode", description: "Message mode: tt, data, or ptt", defaultValue: "" })
    .addOption({
      name: "amount",
      description: "Token amount (for tt/ptt modes)",
      defaultValue: "0",
    })
    .addOption({
      name: "token",
      description: "Token key (e.g. CCIP-BnM)",
      defaultValue: "CCIP-BnM",
    })
    .addOption({
      name: "feeToken",
      description: "Fee payment: native or link",
      defaultValue: "native",
    })
    .addOption({ name: "gasLimit", description: "Dest execution gas limit", defaultValue: "0" })
    .addOption({ name: "data", description: "Hex-encoded data payload", defaultValue: "" })
    .setAction(() => import("./tasks/send-via-router.js"))
    .build(),

  task("check-status", "Check CCIP message delivery status")
    .addOption({ name: "messageId", description: "CCIP message ID to check", defaultValue: "" })
    .setAction(() => import("./tasks/check-status.js"))
    .build(),

  task("check-inbox", "Read cross-chain inbox messages from receiver contract")
    .addOption({
      name: "receiverContract",
      description: "Deployed CCIPReceiverExample address",
      defaultValue: "",
    })
    .addOption({
      name: "count",
      description: "Number of latest messages to show",
      defaultValue: "5",
    })
    .addOption({
      name: "messageId",
      description: "Look up a specific message by ID",
      defaultValue: "",
    })
    .setAction(() => import("./tasks/check-inbox.js"))
    .build(),

  task("manual-execute", "Manually execute a failed CCIP message on destination")
    .addOption({
      name: "messageId",
      description: "CCIP message ID to execute",
      defaultValue: "",
    })
    .addOption({
      name: "gasLimit",
      description: "Gas limit override for ccipReceive execution",
      defaultValue: "0",
    })
    .setAction(() => import("./tasks/manual-execute.js"))
    .build(),

  task("list-messages", "Search and list CCIP messages with filters")
    .addOption({ name: "sender", description: "Filter by sender address", defaultValue: "" })
    .addOption({ name: "receiver", description: "Filter by receiver address", defaultValue: "" })
    .addOption({
      name: "sourceChain",
      description: "Filter by source chain (network ID)",
      defaultValue: "",
    })
    .addOption({
      name: "destChain",
      description: "Filter by destination chain (network ID)",
      defaultValue: "",
    })
    .addOption({
      name: "txHash",
      description: "Filter by source transaction hash",
      defaultValue: "",
    })
    .addOption({
      name: "readyForExec",
      description: "Show only messages ready for manual execution (true/false)",
      defaultValue: "",
    })
    .addOption({
      name: "limit",
      description: "Maximum number of messages to show",
      defaultValue: "10",
    })
    .setAction(() => import("./tasks/list-messages.js"))
    .build(),

  task("pause-contract", "Pause or unpause a CCIPSender or CCIPReceiverExample contract")
    .addOption({ name: "contract", description: "Deployed contract address", defaultValue: "" })
    .addOption({ name: "type", description: "Contract type: sender or receiver", defaultValue: "" })
    .addOption({
      name: "action",
      description: "Action: pause or unpause",
      defaultValue: "",
    })
    .setAction(() => import("./tasks/pause-contract.js"))
    .build(),

  task("withdraw-funds", "Withdraw native currency or ERC20 tokens from a contract")
    .addOption({ name: "contract", description: "Deployed contract address", defaultValue: "" })
    .addOption({ name: "type", description: "Contract type: sender or receiver", defaultValue: "" })
    .addOption({
      name: "beneficiary",
      description: "Address to receive the withdrawn funds",
      defaultValue: "",
    })
    .addOption({
      name: "token",
      description: "ERC20 token address (omit for native withdrawal)",
      defaultValue: "",
    })
    .addOption({
      name: "amount",
      description: "Amount to withdraw in smallest unit (0 = full balance)",
      defaultValue: "0",
    })
    .setAction(() => import("./tasks/withdraw-funds.js"))
    .build(),

  task("query-config", "Query contract configuration (peers, allowlist, failed messages, status)")
    .addOption({ name: "contract", description: "Deployed contract address", defaultValue: "" })
    .addOption({ name: "type", description: "Contract type: sender or receiver", defaultValue: "" })
    .addOption({
      name: "query",
      description: "Query type: peer, allowlist, failed, or status",
      defaultValue: "",
    })
    .addOption({
      name: "chain",
      description: "Chain network ID (for peer/allowlist queries)",
      defaultValue: "",
    })
    .addOption({
      name: "address",
      description: "Sender address to check (for allowlist query)",
      defaultValue: "",
    })
    .addOption({
      name: "messageId",
      description: "Message ID to check (for failed query)",
      defaultValue: "",
    })
    .setAction(() => import("./tasks/query-config.js"))
    .build(),
];

export default defineConfig({
  plugins: [hardhatViemPlugin, hardhatNodeTestRunnerPlugin],
  solidity: { version: "0.8.24" },
  networks,
  tasks,
});
