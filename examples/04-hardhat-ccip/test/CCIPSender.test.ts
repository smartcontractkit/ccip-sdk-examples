import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAbi } from "viem";

import { network } from "hardhat";

void describe("CCIPSender", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const owner = walletClients[0]!;
  const nonOwner = walletClients[1]!;

  // Deploy a fresh LocalSimulator for router address
  const simulator = await viem.deployContract("LocalSimulator");
  const config = await simulator.read.configuration!();
  const chainSelector = (config as [bigint, ...unknown[]])[0];
  const routerAddress = (config as [bigint, string])[1] as `0x${string}`;

  void it("Should deploy with correct router and owner", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const router = (await sender.read.i_router!()) as string;
    assert.equal(router.toLowerCase(), routerAddress.toLowerCase());

    const contractOwner = (await sender.read.owner!()) as string;
    assert.equal(contractOwner.toLowerCase(), owner.account.address.toLowerCase());
  });

  void it("Should register a peer via setPeer", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const peerAddress = "0x1111111111111111111111111111111111111111" as `0x${string}`;

    const hash = await sender.write.setPeer!([chainSelector, peerAddress]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Verify PeerSet event
    const events = await publicClient.getContractEvents({
      address: sender.address,
      abi: sender.abi,
      eventName: "PeerSet",
      fromBlock: receipt.blockNumber,
      strict: true,
    });
    assert.equal(events.length, 1);
    const eventArgs = events[0]!.args as { destChainSelector: bigint; peer: string };
    assert.equal(eventArgs.destChainSelector, chainSelector);
    assert.equal(eventArgs.peer.toLowerCase(), peerAddress.toLowerCase());

    const registered = (await sender.read.peers!([chainSelector])) as string;
    assert.equal(registered.toLowerCase(), peerAddress.toLowerCase());
  });

  void it("Should batch register peers via setPeers", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const selectors = [chainSelector, 1n];
    const addresses = [
      "0x1111111111111111111111111111111111111111" as `0x${string}`,
      "0x2222222222222222222222222222222222222222" as `0x${string}`,
    ];

    const hash = await sender.write.setPeers!([selectors, addresses]);
    await publicClient.waitForTransactionReceipt({ hash });

    for (let i = 0; i < selectors.length; i++) {
      const registered = (await sender.read.peers!([selectors[i]!])) as string;
      assert.equal(registered.toLowerCase(), addresses[i]!.toLowerCase());
    }
  });

  void it("Should revert setPeers on array length mismatch", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);

    await assert.rejects(
      sender.write.setPeers!([
        [chainSelector],
        [
          "0x1111111111111111111111111111111111111111" as `0x${string}`,
          "0x2222222222222222222222222222222222222222" as `0x${string}`,
        ],
      ]),
      (err: Error) => {
        assert.ok(err.message.includes("ArrayLengthMismatch"));
        return true;
      }
    );
  });

  void it("Should revert send on unregistered peer", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const receiver = "0x1111111111111111111111111111111111111111" as `0x${string}`;

    await assert.rejects(
      sender.write.send!(
        [chainSelector, receiver, "0x", [], "0x", "0x0000000000000000000000000000000000000000"],
        { value: 1000000000000000n }
      ),
      (err: Error) => {
        assert.ok(err.message.includes("PeerNotRegistered"));
        return true;
      }
    );
  });

  void it("Should pause and unpause", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);

    await sender.write.pause!();
    const paused = await sender.read.paused!();
    assert.equal(paused, true);

    await sender.write.unpause!();
    const unpaused = await sender.read.paused!();
    assert.equal(unpaused, false);
  });

  void it("Should block sends when paused", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const receiver = "0x1111111111111111111111111111111111111111" as `0x${string}`;

    await sender.write.setPeer!([chainSelector, receiver]);
    await sender.write.pause!();

    await assert.rejects(
      sender.write.send!(
        [chainSelector, receiver, "0x", [], "0x", "0x0000000000000000000000000000000000000000"],
        { value: 1000000000000000n }
      ),
      (err: Error) => {
        assert.ok(err.message.includes("EnforcedPause"));
        return true;
      }
    );
  });

  void it("Should reject non-owner calls to setPeer, pause, withdraw", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);
    const senderAsNonOwner = await viem.getContractAt("CCIPSender", sender.address, {
      client: { public: publicClient, wallet: nonOwner },
    });

    await assert.rejects(
      senderAsNonOwner.write.setPeer!([
        chainSelector,
        "0x1111111111111111111111111111111111111111",
      ]),
      (err: Error) => {
        assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
        return true;
      }
    );

    await assert.rejects(senderAsNonOwner.write.pause!(), (err: Error) => {
      assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
      return true;
    });

    await assert.rejects(
      senderAsNonOwner.write.withdraw!([nonOwner.account.address]),
      (err: Error) => {
        assert.ok(err.message.includes("OwnableUnauthorizedAccount"));
        return true;
      }
    );
  });

  void it("Should withdraw native balance", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);

    // Send ETH to the contract
    await owner.sendTransaction({
      to: sender.address,
      value: 1000000000000000n,
    });

    const balanceBefore = await publicClient.getBalance({ address: owner.account.address });
    await sender.write.withdraw!([owner.account.address]);
    const balanceAfter = await publicClient.getBalance({ address: owner.account.address });

    // Balance should increase (minus gas), but at least more than before minus gas cost
    assert.ok(balanceAfter > balanceBefore - 1000000000000000n);
  });

  void it("Should revert withdraw when nothing to withdraw", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);

    await assert.rejects(sender.write.withdraw!([owner.account.address]), (err: Error) => {
      assert.ok(err.message.includes("NothingToWithdraw"));
      return true;
    });
  });

  void it("Should withdrawToken ERC20 tokens", async function () {
    const sender = await viem.deployContract("CCIPSender", [routerAddress]);

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

    // Drip tokens and transfer some to the sender contract
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
      args: [sender.address, transferAmount],
    });

    // Withdraw full balance (amount = 0)
    await sender.write.withdrawToken!([owner.account.address, ccipBnMAddress, 0n]);

    // Verify contract balance is now 0
    const contractBalance = await publicClient.readContract({
      address: ccipBnMAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [sender.address],
    });
    assert.equal(contractBalance, 0n);
  });
});
