/**
 * Transfer flow: estimateFee + execute via useTransactionExecution.
 * Uses getChain from context (lazy); supports EVM, Solana, and Aptos by ChainFamily.
 */

import { useState, useCallback, useRef } from "react";
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
import { logSDKCall, logSDKCallSync } from "../inspector/index.js";
import { getAnnotation } from "../inspector/annotations.js";

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

interface EstimationCache {
  destChainSelector: bigint;
  tokenDecimals: number;
  message: TransferMessage;
}

export function useTransfer() {
  const [state, setState] = useState<TransferState>(initialState);
  const estimationCacheRef = useRef<EstimationCache | null>(null);
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

  const reset = useCallback(() => {
    setState(initialState);
    estimationCacheRef.current = null;
  }, []);

  const clearEstimate = useCallback(() => {
    setState((prev) => ({ ...prev, fee: null, feeFormatted: null, estimatedTime: null }));
    estimationCacheRef.current = null;
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

        const destInfo = logSDKCallSync(
          {
            method: "networkInfo",
            phase: "estimation",
            displayArgs: { networkId: destNetworkId, side: "destination" },
            ...getAnnotation("networkInfo"),
          },
          () => networkInfo(destNetworkId)
        );
        const destChainSelector = destInfo.chainSelector;

        const tokenInfo = await logSDKCall(
          {
            method: "chain.getTokenInfo",
            phase: "estimation",
            displayArgs: { tokenAddress, side: "source" },
            ...getAnnotation("chain.getTokenInfo"),
          },
          () => chain.getTokenInfo(tokenAddress)
        );

        const amountWei = parseAmount(amount, tokenInfo.decimals);
        const feeTokenAddress = feeToken?.address;

        const message = logSDKCallSync(
          {
            method: "MessageInput",
            phase: "estimation",
            displayArgs: {
              receiver,
              token: tokenAddress,
              amount: amountWei.toString(),
              ...(feeTokenAddress ? { feeToken: feeTokenAddress } : {}),
            },
            ...getAnnotation("MessageInput"),
          },
          () =>
            buildTokenTransferMessage({
              receiver,
              tokenAddress,
              amount: amountWei,
              feeToken: feeTokenAddress,
            })
        );

        const [fee, latency] = await Promise.all([
          logSDKCall(
            {
              method: "chain.getFee",
              phase: "estimation",
              displayArgs: {
                router: sourceConfig.routerAddress,
                destChainSelector: String(destChainSelector),
                side: "source",
              },
              ...getAnnotation("chain.getFee"),
            },
            () =>
              chain.getFee({
                router: sourceConfig.routerAddress,
                destChainSelector,
                message,
              })
          ),
          logSDKCall(
            {
              method: "chain.getLaneLatency",
              phase: "estimation",
              displayArgs: { destChainSelector: String(destChainSelector), side: "source" },
              ...getAnnotation("chain.getLaneLatency"),
            },
            () =>
              chain.getLaneLatency(destChainSelector).catch((err) => {
                console.warn("Failed to fetch lane latency:", err);
                return null;
              })
          ),
        ]);

        // Cache estimation results for reuse in transfer()
        estimationCacheRef.current = {
          destChainSelector,
          tokenDecimals: tokenInfo.decimals,
          message,
        };

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
      feeToken: FeeTokenOptionItem | null,
      remoteTokenFromPool?: string | null
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
        const cache = estimationCacheRef.current;

        // Use cached values from estimation when available, otherwise compute fresh
        let destChainSelector: bigint;
        let tokenDecimals: number;
        let message: TransferMessage;

        if (cache) {
          destChainSelector = cache.destChainSelector;
          tokenDecimals = cache.tokenDecimals;
          message = cache.message;
        } else {
          const destInfo = logSDKCallSync(
            {
              method: "networkInfo",
              phase: "transfer",
              displayArgs: { networkId: destNetworkId, side: "destination" },
              ...getAnnotation("networkInfo"),
            },
            () => networkInfo(destNetworkId)
          );
          destChainSelector = destInfo.chainSelector;

          const tokenInfo = await logSDKCall(
            {
              method: "chain.getTokenInfo",
              phase: "transfer",
              displayArgs: { tokenAddress, side: "source" },
              ...getAnnotation("chain.getTokenInfo"),
            },
            () => chain.getTokenInfo(tokenAddress)
          );
          tokenDecimals = tokenInfo.decimals;

          const amountWei = parseAmount(amount, tokenDecimals);
          const feeTokenAddress = feeToken?.address;

          message = logSDKCallSync(
            {
              method: "MessageInput",
              phase: "transfer",
              displayArgs: {
                receiver,
                token: tokenAddress,
                amount: amountWei.toString(),
                ...(feeTokenAddress ? { feeToken: feeTokenAddress } : {}),
              },
              ...getAnnotation("MessageInput"),
            },
            () =>
              buildTokenTransferMessage({
                receiver,
                tokenAddress,
                amount: amountWei,
                feeToken: feeTokenAddress,
              })
          );
        }

        let fee: bigint;
        if (state.fee != null) {
          fee = state.fee;
        } else {
          fee = await logSDKCall(
            {
              method: "chain.getFee",
              phase: "transfer",
              displayArgs: {
                router: sourceConfig.routerAddress,
                destChainSelector: String(destChainSelector),
                side: "source",
              },
              ...getAnnotation("chain.getFee"),
            },
            () =>
              chain.getFee({
                router: sourceConfig.routerAddress,
                destChainSelector,
                message,
              })
          );
        }

        const senderAddress = senderWallet;

        let initialSourceBalance: bigint | null = null;
        let initialDestBalance: bigint | null = null;
        let destTokenDecimals = tokenDecimals;

        // Resolve remoteToken: use prop from PoolInfo if available, otherwise fall back to registry calls
        let resolvedRemoteToken: string | null = remoteTokenFromPool ?? null;

        try {
          const [sourceBal, remoteToken] = await Promise.all([
            logSDKCall(
              {
                method: "chain.getBalance",
                phase: "transfer",
                displayArgs: { holder: senderAddress, token: tokenSymbol, side: "source" },
                ...getAnnotation("chain.getBalance"),
              },
              () => chain.getBalance({ holder: senderAddress, token: tokenAddress })
            ),
            // Only do registry lookup if we don't already have remoteToken from PoolInfo
            resolvedRemoteToken
              ? Promise.resolve(resolvedRemoteToken)
              : (async (): Promise<string | null> => {
                  const registry = await logSDKCall(
                    {
                      method: "chain.getTokenAdminRegistryFor",
                      phase: "transfer",
                      displayArgs: { routerAddress: sourceConfig.routerAddress, side: "source" },
                      ...getAnnotation("chain.getTokenAdminRegistryFor"),
                    },
                    () => chain.getTokenAdminRegistryFor(sourceConfig.routerAddress)
                  );
                  const tokenConfig = await logSDKCall(
                    {
                      method: "chain.getRegistryTokenConfig",
                      phase: "transfer",
                      displayArgs: {
                        registryAddress: String(registry),
                        tokenAddress,
                        side: "source",
                      },
                      ...getAnnotation("chain.getRegistryTokenConfig"),
                    },
                    () => chain.getRegistryTokenConfig(registry, tokenAddress)
                  );
                  const poolAddress = tokenConfig.tokenPool;
                  if (!poolAddress) return null;
                  try {
                    const remote = await logSDKCall(
                      {
                        method: "chain.getTokenPoolRemote",
                        phase: "transfer",
                        displayArgs: {
                          poolAddress,
                          destChainSelector: String(destChainSelector),
                          side: "source",
                        },
                        ...getAnnotation("chain.getTokenPoolRemote"),
                      },
                      () => chain.getTokenPoolRemote(poolAddress, destChainSelector)
                    );
                    return remote.remoteToken;
                  } catch {
                    return null;
                  }
                })(),
          ]);
          initialSourceBalance = sourceBal;
          resolvedRemoteToken = remoteToken;
          if (resolvedRemoteToken) {
            const destToken = resolvedRemoteToken; // narrow for closures
            const destChain = await getChain(destNetworkId, "transfer");
            const [destBal, destTokenInfo] = await Promise.all([
              logSDKCall(
                {
                  method: "chain.getBalance",
                  phase: "transfer",
                  displayArgs: { holder: receiver, token: tokenSymbol, side: "destination" },
                  ...getAnnotation("chain.getBalance"),
                },
                () => destChain.getBalance({ holder: receiver, token: destToken })
              ),
              logSDKCall(
                {
                  method: "chain.getTokenInfo",
                  phase: "transfer",
                  displayArgs: { tokenAddress: destToken, side: "destination" },
                  ...getAnnotation("chain.getTokenInfo"),
                },
                () => destChain.getTokenInfo(destToken)
              ),
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
          tokenDecimals,
          destTokenDecimals,
          remoteToken: resolvedRemoteToken,
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
