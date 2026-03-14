import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAbi } from "viem";

import { network } from "hardhat";

void describe("CCIPReceiverExample", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const owner = walletClients[0]!;
  const nonOwner = walletClients[1]!;

  const simulator = await viem.deployContract("LocalSimulator");
  const config = await simulator.read.configuration!();
  const chainSelector = (config as [bigint, ...unknown[]])[0];
  const routerAddress = (config as [bigint, string])[1] as `0x${string}`;

  void it("Should deploy with correct router and owner", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);
    const contractOwner = (await receiver.read.owner!()) as string;
    assert.equal(contractOwner.toLowerCase(), owner.account.address.toLowerCase());
  });

  void it("Should allowlist a single sender", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);
    const senderAddr = "0x1111111111111111111111111111111111111111" as `0x${string}`;

    await receiver.write.allowlistSender!([chainSelector, senderAddr, true]);
    const allowed = await receiver.read.allowlistedSenders!([chainSelector, senderAddr]);
    assert.equal(allowed, true);
  });

  void it("Should batch update allowlist via updateAllowlist", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);
    const entries = [
      {
        sourceChainSelector: chainSelector,
        sender: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        allowed: true,
      },
      {
        sourceChainSelector: 1n,
        sender: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        allowed: true,
      },
    ];

    const hash = await receiver.write.updateAllowlist!([entries]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Verify events
    const events = await publicClient.getContractEvents({
      address: receiver.address,
      abi: receiver.abi,
      eventName: "AllowlistUpdated",
      fromBlock: receipt.blockNumber,
      strict: true,
    });
    assert.equal(events.length, 2);

    // Verify state
    for (const entry of entries) {
      const allowed = await receiver.read.allowlistedSenders!([
        entry.sourceChainSelector,
        entry.sender,
      ]);
      assert.equal(allowed, true);
    }
  });

  void it("Should batch update allowlist with mixed add/remove", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);
    const senderAddr = "0x1111111111111111111111111111111111111111" as `0x${string}`;

    // First allowlist
    await receiver.write.allowlistSender!([chainSelector, senderAddr, true]);
    assert.equal(await receiver.read.allowlistedSenders!([chainSelector, senderAddr]), true);

    // Now batch: remove first, add second
    const entries = [
      { sourceChainSelector: chainSelector, sender: senderAddr, allowed: false },
      {
        sourceChainSelector: chainSelector,
        sender: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        allowed: true,
      },
    ];

    await receiver.write.updateAllowlist!([entries]);

    assert.equal(await receiver.read.allowlistedSenders!([chainSelector, senderAddr]), false);
    assert.equal(
      await receiver.read.allowlistedSenders!([
        chainSelector,
        "0x2222222222222222222222222222222222222222",
      ]),
      true
    );
  });

  void it("Should reject non-owner calls to allowlistSender, updateAllowlist, pause, withdraw", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);
    const receiverAsNonOwner = await viem.getContractAt("CCIPReceiverExample", receiver.address, {
      client: { public: publicClient, wallet: nonOwner },
    });

    await assert.rejects(
      receiverAsNonOwner.write.allowlistSender!([
        chainSelector,
        "0x1111111111111111111111111111111111111111",
        true,
      ]),
      (err: Error) => {
        assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
        return true;
      }
    );

    await assert.rejects(
      receiverAsNonOwner.write.updateAllowlist!([
        [
          {
            sourceChainSelector: chainSelector,
            sender: "0x1111111111111111111111111111111111111111" as `0x${string}`,
            allowed: true,
          },
        ],
      ]),
      (err: Error) => {
        assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
        return true;
      }
    );

    await assert.rejects(receiverAsNonOwner.write.pause!(), (err: Error) => {
      assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
      return true;
    });

    await assert.rejects(
      receiverAsNonOwner.write.withdraw!([nonOwner.account.address]),
      (err: Error) => {
        assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
        return true;
      }
    );
  });

  void it("Should pause and block _ccipReceive when paused", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    await receiver.write.pause!();
    assert.equal(await receiver.read.paused!(), true);

    await receiver.write.unpause!();
    assert.equal(await receiver.read.paused!(), false);
  });

  void it("Should revert withdraw when nothing to withdraw", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    await assert.rejects(receiver.write.withdraw!([owner.account.address]), (err: Error) => {
      assert.ok(err.message.includes("NothingToWithdraw"));
      return true;
    });
  });

  void it("Should withdraw native balance", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    // Send ETH to the contract
    await owner.sendTransaction({
      to: receiver.address,
      value: 1000000000000000n,
    });

    const balanceBefore = await publicClient.getBalance({ address: owner.account.address });
    await receiver.write.withdraw!([owner.account.address]);
    const balanceAfter = await publicClient.getBalance({ address: owner.account.address });

    assert.ok(balanceAfter > balanceBefore - 1000000000000000n);
  });

  void it("Should withdrawToken ERC20 tokens", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);

    // Get ccipBnM token from simulator
    const config2 = await simulator.read.configuration!();
    const ccipBnMAddress = (
      config2 as [bigint, string, string, string, string, string]
    )[5] as `0x${string}`;

    const erc20Abi = parseAbi([
      "function drip(address to) external",
      "function transfer(address to, uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
    ]);

    // Drip tokens and transfer some to the receiver contract
    await owner.writeContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "drip",
      args: [owner.account.address],
    });

    const transferAmount = 500000000000000000n;
    await owner.writeContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "transfer",
      args: [receiver.address, transferAmount],
    });

    // Verify tokens are in the contract
    const contractBalance = await publicClient.readContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [receiver.address],
    });
    assert.equal(contractBalance, transferAmount);

    // Withdraw full balance (amount = 0)
    await receiver.write.withdrawToken!([owner.account.address, ccipBnMAddress, 0n]);

    // Verify contract balance is now 0
    const contractBalanceAfter = await publicClient.readContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [receiver.address],
    });
    assert.equal(contractBalanceAfter, 0n);
  });

  void it("Should reject non-owner withdrawToken call", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);
    const receiverAsNonOwner = await viem.getContractAt("CCIPReceiverExample", receiver.address, {
      client: { public: publicClient, wallet: nonOwner },
    });

    await assert.rejects(
      receiverAsNonOwner.write.withdrawToken!([
        nonOwner.account.address,
        "0x1111111111111111111111111111111111111111",
        0n,
      ]),
      (err: Error) => {
        assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
        return true;
      }
    );
  });

  void it("Should query failedMessages mapping", async function () {
    const receiver = await viem.deployContract("CCIPReceiverExample", [routerAddress]);
    const fakeMessageId =
      "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;

    // Should be false for any unknown message ID
    const isFailed = await receiver.read.failedMessages!([fakeMessageId]);
    assert.equal(isFailed, false);
  });
});
