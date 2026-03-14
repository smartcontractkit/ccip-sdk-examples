import "dotenv/config";
import { defineConfig, configVariable, task } from "hardhat/config";
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
];

export default defineConfig({
  solidity: { version: "0.8.24" },
  networks,
  tasks,
});
