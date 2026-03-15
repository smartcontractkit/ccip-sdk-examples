import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zeroAddress, encodeAbiParameters, concat, parseAbi } from "viem";

import { network } from "hardhat";

// EVM_EXTRA_ARGS_V1_TAG (0x97a657c9) + abi.encode(uint256 gasLimit)
// The MockRouter parses this to set the gas limit for ccipReceive execution.
// Default (empty extraArgs) is only 200k, which is insufficient for storage-heavy operations.
function encodeExtraArgsV1(gasLimit: bigint): `0x${string}` {
  const tag = "0x97a657c9" as `0x${string}`;
  const encoded = encodeAbiParameters([{ type: "uint256" }], [gasLimit]);
  return concat([tag, encoded]);
}

void describe("Integration — LocalSimulator", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const owner = walletClients[0]!;

  // Deploy LocalSimulator and get configuration
  const simulator = await viem.deployContract("LocalSimulator");
  const config = await simulator.read.configuration!();
  const chainSelector = (config as [bigint, ...unknown[]])[0];
  // Source and destination router are the same in local simulator
  const routerAddress = (config as [bigint, string])[1] as `0x${string}`;
  const ccipBnMAddress = (
    config as [bigint, string, string, string, string, string]
  )[5] as `0x${string}`;

  // Sufficient gas for receiver execution (covers storage writes in inbox, try/catch, etc.)
  const extraArgs = encodeExtraArgsV1(500_000n);

  // ERC20 ABI for token interactions
  const erc20Abi = parseAbi([
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function drip(address to) external",
  ]);

  void it("Should send a data-only message end-to-end", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    // Register peer and allowlist
    await sender.write.setPeer!([chainSelector, receiver.address]);
    await receiver.write.allowlistSender!([chainSelector, sender.address, true]);

    // Send data-only message (no tokens, native fee)
    const testData = encodeAbiParameters([{ type: "string" }], ["Hello CCIP"]);

    const hash = await sender.write.send!(
      [chainSelector, receiver.address, testData, [], extraArgs, zeroAddress],
      { value: 1000000000000000000n }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    // Verify inbox has the message
    const inboxLength = await receiver.read.getInboxLength!();
    assert.equal(inboxLength, 1n);

    // Verify DataReceived event
    const dataEvents = await publicClient.getContractEvents({
      address: receiver.address,
      abi: receiver.abi,
      eventName: "DataReceived",
      fromBlock: receipt.blockNumber,
      strict: true,
    });
    assert.equal(dataEvents.length, 1);
    assert.equal(
      (dataEvents[0]!.args as { sender: string }).sender.toLowerCase(),
      sender.address.toLowerCase()
    );
  });

  void it("Should send a token-only transfer end-to-end", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    await sender.write.setPeer!([chainSelector, receiver.address]);
    await receiver.write.allowlistSender!([chainSelector, sender.address, true]);

    // Drip tokens to the owner
    await owner.writeContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "drip",
      args: [owner.account.address],
    });

    const amount = 500000000000000000n; // 0.5 tokens

    // Approve sender contract to pull tokens
    await owner.writeContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [sender.address, amount],
    });

    // Send token-only transfer with extraArgs for receiver execution gas.
    // Explicit gas limit avoids auto-estimation inflation from CallWithExactGas in MockRouter.
    const hash = await sender.write.send!(
      [
        chainSelector,
        receiver.address,
        "0x",
        [{ token: ccipBnMAddress, amount }],
        extraArgs,
        zeroAddress,
      ],
      { value: 1000000000000000000n, gas: 2_000_000n }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    // Verify TokensReceived event on receiver
    const tokenEvents = await publicClient.getContractEvents({
      address: receiver.address,
      abi: receiver.abi,
      eventName: "TokensReceived",
      fromBlock: receipt.blockNumber,
      strict: true,
    });
    assert.equal(tokenEvents.length, 1);
  });

  void it("Should send a programmable token transfer (PTT) end-to-end", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    await sender.write.setPeer!([chainSelector, receiver.address]);
    await receiver.write.allowlistSender!([chainSelector, sender.address, true]);

    // Drip tokens
    await owner.writeContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "drip",
      args: [owner.account.address],
    });

    const amount = 500000000000000000n;
    // Use a different address as recipient to isolate the balance change
    const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`;

    // Approve
    await owner.writeContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [sender.address, amount],
    });

    // Encode recipient address as data payload (PTT pattern)
    const data = encodeAbiParameters([{ type: "address" }], [recipient]);

    const balanceBefore = await publicClient.readContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipient],
    });

    const hash = await sender.write.send!(
      [
        chainSelector,
        receiver.address,
        data,
        [{ token: ccipBnMAddress, amount }],
        extraArgs,
        zeroAddress,
      ],
      { value: 1000000000000000000n, gas: 2_000_000n }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    // Verify tokens forwarded to recipient
    const balanceAfter = await publicClient.readContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipient],
    });
    assert.equal(balanceAfter - balanceBefore, amount);

    // Verify TokensForwarded event
    const fwdEvents = await publicClient.getContractEvents({
      address: receiver.address,
      abi: receiver.abi,
      eventName: "TokensForwarded",
      fromBlock: receipt.blockNumber,
      strict: true,
    });
    assert.equal(fwdEvents.length, 1);
    assert.equal(
      (fwdEvents[0]!.args as { recipient: string }).recipient.toLowerCase(),
      recipient.toLowerCase()
    );
  });

  void it("Should batch allowlist multiple senders via updateAllowlist", async function () {
    const sender1 = await viem.deployContract("CCIPSender", [routerAddress]);
    const sender2 = await viem.deployContract("CCIPSender", [routerAddress]);
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    // Register peers on both senders
    await sender1.write.setPeer!([chainSelector, receiver.address]);
    await sender2.write.setPeer!([chainSelector, receiver.address]);

    // Batch allowlist both senders
    await receiver.write.updateAllowlist!([
      [
        { sourceChainSelector: chainSelector, sender: sender1.address, allowed: true },
        { sourceChainSelector: chainSelector, sender: sender2.address, allowed: true },
      ],
    ]);

    // Verify both can send data-only messages
    const testData = encodeAbiParameters([{ type: "string" }], ["test"]);

    const hash1 = await sender1.write.send!(
      [chainSelector, receiver.address, testData, [], extraArgs, zeroAddress],
      { value: 1000000000000000000n }
    );
    const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });
    assert.equal(receipt1.status, "success");

    const hash2 = await sender2.write.send!(
      [chainSelector, receiver.address, testData, [], extraArgs, zeroAddress],
      { value: 1000000000000000000n }
    );
    const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });
    assert.equal(receipt2.status, "success");

    // Both messages in inbox
    const inboxLength = await receiver.read.getInboxLength!();
    assert.equal(inboxLength, 2n);
  });

  void it("Should handle failed message via defensive try/catch (PTT with address(0))", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    await sender.write.setPeer!([chainSelector, receiver.address]);
    await receiver.write.allowlistSender!([chainSelector, sender.address, true]);

    // Drip tokens
    await owner.writeContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "drip",
      args: [owner.account.address],
    });

    const amount = 500000000000000000n;
    await owner.writeContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [sender.address, amount],
    });

    // PTT with address(0) as recipient — processMessage will revert with InvalidRecipient
    const badData = encodeAbiParameters([{ type: "address" }], [zeroAddress]);

    const hash = await sender.write.send!(
      [
        chainSelector,
        receiver.address,
        badData,
        [{ token: ccipBnMAddress, amount }],
        extraArgs,
        zeroAddress,
      ],
      { value: 1000000000000000000n, gas: 2_000_000n }
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success"); // tx succeeds — try/catch caught the error

    // Verify MessageFailed event was emitted
    const failEvents = await publicClient.getContractEvents({
      address: receiver.address,
      abi: receiver.abi,
      eventName: "MessageFailed",
      fromBlock: receipt.blockNumber,
      strict: true,
    });
    assert.equal(failEvents.length, 1);

    // Tokens should remain in the receiver contract (not forwarded)
    const receiverBalance = await publicClient.readContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [receiver.address],
    });
    assert.equal(receiverBalance, amount);
  });

  void it("Should revert when sender is not allowlisted", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    // Register peer but do NOT allowlist
    await sender.write.setPeer!([chainSelector, receiver.address]);

    const testData = encodeAbiParameters([{ type: "string" }], ["test"]);

    // Should revert — MockRouter wraps receiver errors in ReceiverError
    await assert.rejects(
      sender.write.send!([chainSelector, receiver.address, testData, [], extraArgs, zeroAddress], {
        value: 1000000000000000000n,
      }),
      (err: Error) => {
        assert.ok(err.message.includes("ReceiverError"));
        return true;
      }
    );
  });
});
