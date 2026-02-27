/**
 * Aptos-only transfer execution using generateUnsignedSendMessage.
 * Deserializes BCS bytes → SimpleTransaction → wallet signs + submits.
 * Uses chain.provider (the SDK's Aptos client) for transaction confirmation.
 */

import { useCallback } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Deserializer, SimpleTransaction } from "@aptos-labs/ts-sdk";
import type { AptosChain } from "@chainlink/ccip-sdk";
import { networkInfo } from "@chainlink/ccip-sdk";
import { NETWORKS } from "@ccip-examples/shared-config";
import type { TransactionResult, TransferMessage } from "./transferTypes.js";

export interface UseAptosTransferParams {
  onStateChange: (state: "approving" | "sending" | "confirming" | "tracking") => void;
  onTxHash: (hash: string) => void;
  onMessageId: (id: string) => void;
}

export function useAptosTransfer({ onStateChange, onTxHash, onMessageId }: UseAptosTransferParams) {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wallet adapter hook is safe to destructure
  const { signTransaction, submitTransaction, account } = useWallet();

  const executeAptosTransfer = useCallback(
    async (
      chain: AptosChain,
      sourceNetworkId: string,
      destNetworkId: string,
      message: TransferMessage,
      fee: bigint
    ): Promise<TransactionResult> => {
      if (!account?.address) {
        throw new Error("Aptos wallet not connected");
      }

      const router = NETWORKS[sourceNetworkId]?.routerAddress;
      if (!router) throw new Error(`No router for ${sourceNetworkId}`);

      const destChainSelector = networkInfo(destNetworkId).chainSelector;

      const unsignedTx = await chain.generateUnsignedSendMessage({
        sender: account.address.toString(),
        router,
        destChainSelector,
        message: { ...message, fee },
      });

      onStateChange("sending");

      // Deserialize BCS bytes into a SimpleTransaction the wallet can sign
      const rawTx = SimpleTransaction.deserialize(new Deserializer(unsignedTx.transactions[0]));

      // Sign then submit (signAndSubmitTransaction expects InputTransactionData, not raw tx)
      const senderAuthenticator = await signTransaction(rawTx);
      const pendingTx = await submitTransaction({
        transaction: rawTx,
        senderAuthenticator,
      });
      const txHash = pendingTx.hash;
      onTxHash(txHash);

      onStateChange("confirming");
      // Reuse the SDK's Aptos provider — already configured with the correct RPC + network
      await chain.provider.waitForTransaction({ transactionHash: txHash });

      onStateChange("tracking");
      const tx = await chain.getTransaction(txHash);
      const messages = await chain.getMessagesInTx(tx);
      const msgId = messages[0]?.message.messageId;
      if (msgId) onMessageId(msgId);

      return { messageId: msgId, txHash };
    },
    [account, signTransaction, submitTransaction, onStateChange, onTxHash, onMessageId]
  );

  return { executeAptosTransfer };
}
