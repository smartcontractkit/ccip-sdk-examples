/**
 * Debug: replay the OffRamp execute for a Canton-sourced message locally.
 * Fetches the verifier result from the indexer, re-encodes the message with
 * the SDK codec, and eth_calls offRamp.execute to surface the revert reason.
 *
 * Usage: pnpm tsx src/debug-execute.ts <messageId>
 */
import { encodeMessageV1 } from "@chainlink/ccip-sdk/dist/evm/messageCodec.js";
import { Interface } from "ethers";

const messageId = process.argv[2];
if (!messageId) throw new Error("usage: tsx src/debug-execute.ts <messageId>");

const INDEXER = "https://indexer-1.testnet.ccip.chain.link";
const RPC = process.env["EVM_RPC_URL"];
if (!RPC) throw new Error("set EVM_RPC_URL");

const res = await fetch(`${INDEXER}/v1/verifierresults/${messageId}`);
const body = await res.json();
const vr = body.results?.[0];
if (!vr) throw new Error("no verifier result for " + messageId);
const msg = vr.verifierResult.message;
const ccvData = vr.verifierResult.ccv_data;
const verifierDest = vr.verifierResult.verifier_dest_address;

// NOTE: exact values — indexer JSON floats truncate big selectors.
const encodedMessage = encodeMessageV1({
  sourceChainSelector: 9268731218649498074n, // canton testnet
  destChainSelector: 16015286601757825753n, // sepolia
  messageNumber: 8n,
  executionGasLimit: msg.execution_gas_limit,
  ccipReceiveGasLimit: 0,
  finality: "0x00000000",
  ccvAndExecutorHash: msg.ccv_and_executor_hash,
  onRampAddress: msg.on_ramp_address,
  offRampAddress: msg.off_ramp_address,
  sender: msg.sender,
  receiver: msg.receiver,
  destBlob: "0x",
  data: "0x",
  tokenTransfer: {
    amount: BigInt(msg.token_transfer.amount),
    sourcePoolAddress: msg.token_transfer.source_pool_address,
    sourceTokenAddress: msg.token_transfer.source_token_address,
    destTokenAddress: msg.token_transfer.dest_token_address,
    tokenReceiver: msg.token_transfer.token_receiver,
    extraData: msg.token_transfer.extra_data,
  },
});

const offramp = new Interface([
  "function execute(bytes encodedMessage, address[] ccvs, bytes[] verifierResults, uint32 gasLimitOverride)",
]);
const data = offramp.encodeFunctionData("execute", [encodedMessage, [verifierDest], [ccvData], 0]);

const rpcRes = await fetch(RPC, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: msg.off_ramp_address, data }, "latest"],
  }),
});
const out = await rpcRes.json();
console.log("execute simulation:", out.error ? "REVERTS" : "OK");
if (out.error) {
  console.log("error:", JSON.stringify(out.error).slice(0, 300));
} else {
  console.log("result:", JSON.stringify(out.result).slice(0, 200));
}
