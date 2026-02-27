/**
 * Custom hooks exports
 *
 * Note: Wallet functionality is now handled by wagmi hooks:
 * - useAccount() - Get connected address and status
 * - useConnect() / useDisconnect() - Connect/disconnect wallet
 * - useSwitchChain() - Switch networks
 * - useWalletClient() - Get wallet for signing
 * - usePublicClient() - Get client for reading
 *
 * @see https://wagmi.sh/react/api/hooks
 */
export { useTransfer } from "./useTransfer.js";
export type { TransferStatusStatus, TransferState } from "@ccip-examples/shared-utils";
export { useMessageStatus, type MessageStatusResult } from "@ccip-examples/shared-utils/hooks";
export { useGetChain } from "./useGetChain.js";
export {
  useTokenInfo,
  type TokenInfo,
  type UseTokenInfoResult,
} from "@ccip-examples/shared-utils/hooks";
export type { WalletBalances, BalanceData } from "@ccip-examples/shared-utils/hooks";
