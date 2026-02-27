/**
 * Transfer flow: estimateFee + execute via useTransactionExecution.
 * Uses getChain from context (lazy); supports EVM, Solana, and Aptos by ChainFamily.
 */

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { useWallet as useAptosWallet } from "@aptos-labs/wallet-adapter-react";
import { networkInfo } from "@chainlink/ccip-sdk";
import { NETWORKS, getTokenAddress, type FeeTokenOptionItem } from "@ccip-examples/shared-config";
import {
  parseAmount,
  formatAmount,
  formatLatency,
  buildTokenTransferMessage,
  categorizeError,
  getWalletAddress,
  type WalletAddresses,
  type LastTransferContext,
  type TransferState,
} from "@ccip-examples/shared-utils";
import { useChains } from "./useChains.js";
import { useTransactionExecution } from "./useTransactionExecution.js";
import type { TransferMessage } from "./transferTypes.js";

const initialState: TransferState = {
  status: "idle",
  error: null,
  txHash: null,
  messageId: null,
  fee: null,
  feeFormatted: null,
  estimatedTime: null,
  categorizedError: null,
  lastTransferContext: null,
};

export function useTransfer() {
  const [state, setState] = useState<TransferState>(initialState);
  const { getChain } = useChains();
  const { address: evmAddress } = useAccount();
  const { publicKey: solanaPublicKey } = useSolanaWallet();
  const { account: aptosAccount } = useAptosWallet();

  const walletAddresses: WalletAddresses = {
    evm: evmAddress ?? null,
    solana: solanaPublicKey?.toBase58() ?? null,
    aptos: aptosAccount?.address.toString() ?? null,
  };

  const { executeTransfer } = useTransactionExecution({
    onStateChange: () => {},
    onTxHash: (hash) => setState((prev) => ({ ...prev, txHash: hash })),
    onMessageId: (id) => setState((prev) => ({ ...prev, messageId: id })),
  });

  const reset = useCallback(() => setState(initialState), []);

  const clearEstimate = useCallback(() => {
    setState((prev) => ({ ...prev, fee: null, feeFormatted: null, estimatedTime: null }));
  }, []);

  const estimateFee = useCallback(
    async (
      sourceNetworkId: string,
      destNetworkId: string,
      tokenSymbol: string,
      amount: string,
      receiver: string,
      feeToken: FeeTokenOptionItem | null
    ): Promise<{ fee: bigint; feeFormatted: string; estimatedTime: string | null } | null> => {
      setState((prev) => ({ ...prev, status: "estimating", error: null }));

      try {
        const sourceConfig = NETWORKS[sourceNetworkId];
        if (!sourceConfig) throw new Error("Invalid source network");

        const tokenAddress = getTokenAddress(tokenSymbol, sourceNetworkId);
        if (!tokenAddress) throw new Error(`Token ${tokenSymbol} not found on ${sourceNetworkId}`);

        const chain = await getChain(sourceNetworkId);
        const destChainSelector = networkInfo(destNetworkId).chainSelector;
        const tokenInfo = await chain.getTokenInfo(tokenAddress);
        const amountWei = parseAmount(amount, tokenInfo.decimals);
        const feeTokenAddress = feeToken?.address;

        const message = buildTokenTransferMessage({
          receiver,
          tokenAddress,
          amount: amountWei,
          feeToken: feeTokenAddress,
        });

        const [fee, latency] = await Promise.all([
          chain.getFee({
            router: sourceConfig.routerAddress,
            destChainSelector,
            message,
          }),
          chain.getLaneLatency(destChainSelector).catch((err) => {
            console.warn("Failed to fetch lane latency:", err);
            return null;
          }),
        ]);

        const feeDecimals = feeToken?.decimals ?? sourceConfig.nativeCurrency.decimals;
        const feeSymbol = feeToken?.symbol ?? sourceConfig.nativeCurrency.symbol;
        const feeFormatted = `${formatAmount(fee, feeDecimals)} ${feeSymbol}`;
        const estimatedTime = latency ? formatLatency(latency.totalMs) : null;

        setState((prev) => ({
          ...prev,
          status: "idle",
          fee,
          feeFormatted,
          estimatedTime,
        }));

        return { fee, feeFormatted, estimatedTime };
      } catch (err) {
        const family = sourceNetworkId ? networkInfo(sourceNetworkId).family : undefined;
        const categorized = categorizeError(err, { chainFamily: family });
        setState((prev) => ({
          ...prev,
          status: "idle",
          error: categorized.message,
          categorizedError: categorized,
        }));
        return null;
      }
    },
    [getChain]
  );

  const transfer = useCallback(
    async (
      sourceNetworkId: string,
      destNetworkId: string,
      tokenSymbol: string,
      amount: string,
      receiver: string,
      feeToken: FeeTokenOptionItem | null
    ): Promise<{ txHash: string; messageId: string | undefined } | null> => {
      const senderWallet = getWalletAddress(sourceNetworkId, walletAddresses);
      if (!senderWallet) {
        setState((prev) => ({
          ...prev,
          status: "failed",
          error: "Wallet not connected for source chain",
        }));
        return null;
      }

      setState((prev) => ({ ...prev, status: "sending", error: null }));

      try {
        const sourceConfig = NETWORKS[sourceNetworkId];
        if (!sourceConfig) throw new Error("Invalid source network");

        const tokenAddress = getTokenAddress(tokenSymbol, sourceNetworkId);
        if (!tokenAddress) throw new Error(`Token ${tokenSymbol} not found`);

        const chain = await getChain(sourceNetworkId);
        const destChainSelector = networkInfo(destNetworkId).chainSelector;
        const tokenInfo = await chain.getTokenInfo(tokenAddress);
        const amountWei = parseAmount(amount, tokenInfo.decimals);
        const feeTokenAddress = feeToken?.address;

        const message: TransferMessage = buildTokenTransferMessage({
          receiver,
          tokenAddress,
          amount: amountWei,
          feeToken: feeTokenAddress,
        });

        let fee: bigint;
        if (state.fee != null) {
          fee = state.fee;
        } else {
          fee = await chain.getFee({
            router: sourceConfig.routerAddress,
            destChainSelector,
            message,
          });
        }

        const senderAddress = senderWallet;

        let initialSourceBalance: bigint | null = null;
        let initialDestBalance: bigint | null = null;
        let destTokenDecimals = tokenInfo.decimals;
        try {
          const [sourceBal, remoteToken] = await Promise.all([
            chain.getBalance({ holder: senderAddress, token: tokenAddress }),
            (async (): Promise<string | null> => {
              const registry = await chain.getTokenAdminRegistryFor(sourceConfig.routerAddress);
              const tokenConfig = await chain.getRegistryTokenConfig(registry, tokenAddress);
              const poolAddress = tokenConfig.tokenPool;
              if (!poolAddress) return null;
              try {
                const remote = await chain.getTokenPoolRemote(poolAddress, destChainSelector);
                return remote.remoteToken;
              } catch {
                return null;
              }
            })(),
          ]);
          initialSourceBalance = sourceBal;
          if (remoteToken) {
            const destChain = await getChain(destNetworkId);
            const [destBal, destTokenInfo] = await Promise.all([
              destChain.getBalance({ holder: receiver, token: remoteToken }),
              destChain.getTokenInfo(remoteToken),
            ]);
            initialDestBalance = destBal;
            destTokenDecimals = destTokenInfo.decimals;
          }
        } catch {
          // Non-fatal; leave initial balances null
        }

        const result = await executeTransfer(chain, sourceNetworkId, destNetworkId, message, fee);

        const lastTransferContext: LastTransferContext = {
          sourceNetworkId,
          destNetworkId,
          tokenAddress,
          receiverAddress: receiver,
          senderAddress,
          tokenDecimals: tokenInfo.decimals,
          destTokenDecimals,
          initialSourceBalance,
          initialDestBalance,
        };

        setState((prev) => ({
          ...prev,
          status: "success",
          error: null,
          txHash: result.txHash,
          messageId: result.messageId ?? null,
          lastTransferContext,
        }));

        return { txHash: result.txHash, messageId: result.messageId };
      } catch (err) {
        const family = sourceNetworkId ? networkInfo(sourceNetworkId).family : undefined;
        const categorized = categorizeError(err, { chainFamily: family });
        setState((prev) => ({
          ...prev,
          status: "failed",
          error: categorized.message,
          categorizedError: categorized,
        }));
        return null;
      }
    },
    [getChain, walletAddresses, state.fee, executeTransfer]
  );

  return {
    ...state,
    estimateFee,
    transfer,
    reset,
    clearEstimate,
  };
}
