/**
 * Solana-only transfer execution using generateUnsignedSendMessage.
 * Uses shared-utils parseSolanaError for errors.
 */

import { useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { SolanaChain } from "@chainlink/ccip-sdk";
import { networkInfo } from "@chainlink/ccip-sdk";
import { NETWORKS } from "@ccip-examples/shared-config";
import { parseSolanaError, confirmTransaction } from "@ccip-examples/shared-utils";
import type { TransactionResult, TransferMessage } from "./transferTypes.js";

export interface UseSolanaTransferParams {
  onStateChange: (state: "approving" | "sending" | "confirming" | "tracking") => void;
  onTxHash: (hash: string) => void;
  onMessageId: (id: string) => void;
}

export function useSolanaTransfer({
  onStateChange,
  onTxHash,
  onMessageId,
}: UseSolanaTransferParams) {
  const { publicKey: solanaPublicKey, sendTransaction } = useWallet();
  const { connection: solanaConnection } = useConnection();

  const executeSolanaTransfer = useCallback(
    async (
      chain: SolanaChain,
      sourceNetworkId: string,
      destNetworkId: string,
      message: TransferMessage,
      fee: bigint
    ): Promise<TransactionResult> => {
      // Wallet adapter types allow undefined; runtime check needed
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard
      if (solanaPublicKey == null || sendTransaction == null) {
        throw new Error("Solana wallet not connected");
      }

      const router = NETWORKS[sourceNetworkId]?.routerAddress;
      if (!router) throw new Error(`No router for ${sourceNetworkId}`);

      const destChainSelector = networkInfo(destNetworkId).chainSelector;

      try {
        const unsignedTx = await chain.generateUnsignedSendMessage({
          sender: solanaPublicKey.toBase58(),
          router,
          destChainSelector,
          message: { ...message, fee },
        });

        // Retry loop covering both send AND confirm: if the user takes too long
        // to sign in the wallet popup the blockhash expires. This can surface as
        // either a send-time error or a confirmation-time expiration. In both
        // cases we rebuild the transaction with a fresh blockhash and re-prompt.
        const MAX_ATTEMPTS = 3;
        let signature: string | undefined;
        let confirmed = false;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          onStateChange("sending");

          const blockhash = await solanaConnection.getLatestBlockhash("confirmed");
          const messageV0 = new TransactionMessage({
            payerKey: solanaPublicKey,
            recentBlockhash: blockhash.blockhash,
            instructions: unsignedTx.instructions,
          }).compileToV0Message(unsignedTx.lookupTables);

          const transaction = new VersionedTransaction(messageV0);

          try {
            signature = await sendTransaction(transaction, solanaConnection, {
              skipPreflight: true,
              maxRetries: 5,
            });
          } catch (sendErr: unknown) {
            const isBlockheightError =
              sendErr instanceof Error &&
              sendErr.name === "TransactionExpiredBlockheightExceededError";

            if (isBlockheightError && attempt < MAX_ATTEMPTS) {
              console.warn(
                `Blockhash expired on send (attempt ${attempt}/${MAX_ATTEMPTS}), retrying…`
              );
              continue;
            }
            throw sendErr;
          }

          onTxHash(signature);

          // Poll-based confirmation — uses getSignatureStatus() so no
          // blockhash is needed for the confirmation step itself.
          onStateChange("confirming");
          const result = await confirmTransaction({
            connection: solanaConnection,
            signature,
            lastValidBlockHeight: blockhash.lastValidBlockHeight,
          });

          if (result.confirmed) {
            if (!result.success) throw new Error("Solana transaction failed on-chain");
            confirmed = true;
            break;
          }

          // Transaction expired before confirmation — retry with fresh tx
          if (attempt < MAX_ATTEMPTS) {
            console.warn(
              `Transaction expired during confirmation (attempt ${attempt}/${MAX_ATTEMPTS}), retrying…`
            );
            continue;
          }
        }

        if (!signature || !confirmed) {
          throw new Error("Solana transaction could not be confirmed after multiple attempts");
        }

        onStateChange("tracking");
        const tx = await chain.getTransaction(signature);
        const messages = await chain.getMessagesInTx(tx);
        const msgId = messages[0]?.message.messageId;
        if (msgId) onMessageId(msgId);

        return { messageId: msgId, txHash: signature };
      } catch (err: unknown) {
        const parsed = parseSolanaError(err);
        if (parsed) throw new Error(parsed.userMessage, { cause: err });
        throw err;
      }
    },
    [solanaPublicKey, sendTransaction, solanaConnection, onStateChange, onTxHash, onMessageId]
  );

  return { executeSolanaTransfer };
}
