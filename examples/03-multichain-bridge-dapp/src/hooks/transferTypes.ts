import type { MessageInput } from "@chainlink/ccip-sdk";

/**
 * Message for execution: MessageInput with fee (fee added at send time).
 */
export type TransferMessage = MessageInput;

export interface TransactionResult {
  messageId: string | undefined;
  txHash: string;
}

export type TransactionStateCallback = (
  state: "approving" | "sending" | "confirming" | "tracking"
) => void;
