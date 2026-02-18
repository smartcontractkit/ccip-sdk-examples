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
export { useTransfer, type TransferStatus, type TransferState } from "./useTransfer.js";
export { useMessageStatus, type MessageStatusResult } from "./useMessageStatus.js";
export { useTokenInfo, type TokenInfo, type UseTokenInfoResult } from "./useTokenInfo.js";
export { useLaneLatency, type UseLaneLatencyResult } from "./useLaneLatency.js";
export { getChainInstance, clearChainCache, getChainCacheSize } from "./useChain.js";
