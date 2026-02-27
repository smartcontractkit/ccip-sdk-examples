/**
 * EVM-only transfer execution using generateUnsignedSendMessage.
 * Pre-flight simulation for early error surfacing; uses shared-utils parseEVMError.
 */

import { useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { networkInfo, type EVMChain } from "@chainlink/ccip-sdk";
import { NETWORKS } from "@ccip-examples/shared-config";
import { parseEVMError } from "@ccip-examples/shared-utils";
import type { TransactionResult, TransferMessage } from "./transferTypes.js";

type HexString = `0x${string}`;
function toHex(value: unknown): HexString {
  return String(value) as HexString;
}

export interface UseEVMTransferParams {
  onStateChange: (state: "approving" | "sending" | "confirming" | "tracking") => void;
  onTxHash: (hash: string) => void;
  onMessageId: (id: string) => void;
}

export function useEVMTransfer({ onStateChange, onTxHash, onMessageId }: UseEVMTransferParams) {
  const { address: evmAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const executeEVMTransfer = useCallback(
    async (
      chain: EVMChain,
      sourceNetworkId: string,
      destNetworkId: string,
      message: TransferMessage,
      fee: bigint
    ): Promise<TransactionResult> => {
      if (!walletClient || !publicClient || !evmAddress) {
        throw new Error("EVM wallet not connected");
      }

      const router = NETWORKS[sourceNetworkId]?.routerAddress;
      if (!router) throw new Error(`No router for ${sourceNetworkId}`);

      const destChainSelector = networkInfo(destNetworkId).chainSelector;

      const unsignedTx = await chain.generateUnsignedSendMessage({
        sender: evmAddress,
        router,
        destChainSelector,
        message: { ...message, fee },
      });

      const transactions = unsignedTx.transactions;
      const approvalTxs = transactions.slice(0, -1);
      for (const tx of approvalTxs) {
        onStateChange("approving");
        const hash = await walletClient.sendTransaction({
          to: toHex(tx.to),
          data: toHex(tx.data),
          account: evmAddress,
        });
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      }

      onStateChange("sending");
      const sendTx = transactions[transactions.length - 1];
      if (!sendTx) throw new Error("No send transaction");

      try {
        await publicClient.call({
          to: toHex(sendTx.to),
          data: toHex(sendTx.data),
          value: fee,
          account: evmAddress,
        });
      } catch (simError: unknown) {
        const parsed = parseEVMError(simError);
        if (parsed) throw new Error(parsed.userMessage, { cause: simError });
        throw simError;
      }

      const sendHash = await walletClient.sendTransaction({
        to: toHex(sendTx.to),
        data: toHex(sendTx.data),
        value: fee,
        account: evmAddress,
      });

      onTxHash(sendHash);
      onStateChange("confirming");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: sendHash,
        confirmations: 1,
      });

      if (receipt.status === "reverted") {
        let reason = "Transaction reverted";
        try {
          await publicClient.call({
            to: toHex(sendTx.to),
            data: toHex(sendTx.data),
            value: fee,
            account: evmAddress,
            blockNumber: receipt.blockNumber,
          });
        } catch (err: unknown) {
          const parsed = parseEVMError(err);
          if (parsed) reason = parsed.userMessage;
          else if (err instanceof Error) reason = err.message.slice(0, 300);
        }
        throw new Error(reason);
      }

      onStateChange("tracking");
      const messages = await chain.getMessagesInTx(sendHash);
      const msgId = messages[0]?.message.messageId;
      if (msgId) onMessageId(msgId);

      return { messageId: msgId, txHash: sendHash };
    },
    [walletClient, publicClient, evmAddress, onStateChange, onTxHash, onMessageId]
  );

  return { executeEVMTransfer };
}
