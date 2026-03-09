/**
 * Bridge form: all 4 networks, PoolInfo, validation with ChainFamily.
 * Fee payment via useFeeTokens + FeeTokenOptions (native + LINK or SDK fee tokens).
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { networkInfo } from "@chainlink/ccip-sdk";
import {
  NETWORKS,
  getTokenAddress,
  CHAIN_FAMILY_LABELS,
  type FeeTokenOptionItem,
} from "@ccip-examples/shared-config";
import {
  isValidAddress,
  isValidAmount,
  formatAmountFull,
  copyToClipboard,
  getWalletAddress,
  getAddressPlaceholder,
  COPIED_FEEDBACK_MS,
  type WalletAddresses,
} from "@ccip-examples/shared-utils";
import {
  Select,
  Input,
  Button,
  Alert,
  FeeTokenOptions,
  FeeEstimateDisplay,
  BalancesList,
  CopyIcon,
  CheckIcon,
  type BalanceItem,
} from "@ccip-examples/shared-components";
import { useWalletBalances, useFeeTokens } from "@ccip-examples/shared-utils/hooks";
import { inspectorStore } from "../../inspector/index.js";
import { getAnnotation } from "../../inspector/annotations.js";
import { serializeForDisplay } from "@ccip-examples/shared-utils/inspector";
import { PoolInfo } from "./PoolInfo.js";
import { useChains } from "../../hooks/useChains.js";
import { NETWORK_TO_CHAIN_ID } from "@ccip-examples/shared-config/wagmi";
import styles from "@ccip-examples/shared-components/bridge/BridgeForm.module.css";

const TOKEN_SYMBOL = "CCIP-BnM";

interface BridgeFormProps {
  walletAddresses: WalletAddresses;
  currentChainId: number | null;
  fee: bigint | null;
  feeFormatted: string | null;
  estimatedTime: string | null;
  isLoading: boolean;
  onEstimateFee: (
    source: string,
    dest: string,
    token: string,
    amount: string,
    receiver: string,
    feeToken: FeeTokenOptionItem | null
  ) => Promise<void>;
  onTransfer: (
    source: string,
    dest: string,
    token: string,
    amount: string,
    receiver: string,
    feeToken: FeeTokenOptionItem | null,
    remoteToken: string | null
  ) => Promise<void>;
  onSwitchChain: (chainId: number) => void;
  onClearEstimate: () => void;
  onReset: () => void;
}

export function BridgeForm({
  walletAddresses,
  currentChainId,
  fee,
  feeFormatted,
  estimatedTime,
  isLoading,
  onEstimateFee,
  onTransfer,
  onSwitchChain,
  onClearEstimate,
  onReset,
}: BridgeFormProps) {
  const [sourceNetworkId, setSourceNetworkId] = useState("");
  const [destNetworkId, setDestNetworkId] = useState("");
  const [amount, setAmount] = useState("");
  const [receiver, setReceiver] = useState("");
  const [useSelfAsReceiver, setUseSelfAsReceiver] = useState(true);
  const [copied, setCopied] = useState(false);
  const [poolRemoteToken, setPoolRemoteToken] = useState<string | null>(null);

  const { isEVM, getChain } = useChains();

  /** Clear stale transfer result + fee + inspector when the user changes source network */
  const handleSourceChange = useCallback(
    (id: string) => {
      setSourceNetworkId(id);
      onReset();
      onClearEstimate();
      inspectorStore.clearCalls();
    },
    [onReset, onClearEstimate]
  );

  const handleDestChange = useCallback(
    (id: string) => {
      setDestNetworkId(id);
      onReset();
      onClearEstimate();
    },
    [onReset, onClearEstimate]
  );

  /** Wallet address for the selected source chain (for balance + fee queries) */
  const walletAddress = getWalletAddress(sourceNetworkId || null, walletAddresses);

  const sourceConfig = sourceNetworkId ? NETWORKS[sourceNetworkId] : null;
  const routerAddress = sourceConfig?.routerAddress ?? null;

  const allNetworks = useMemo(() => Object.entries(NETWORKS).filter(([id]) => NETWORKS[id]), []);

  const destNetworks = useMemo(
    () => allNetworks.filter(([id]) => id !== sourceNetworkId),
    [allNetworks, sourceNetworkId]
  );

  const tokenAddress = sourceNetworkId
    ? (getTokenAddress(TOKEN_SYMBOL, sourceNetworkId) ?? null)
    : null;

  /** Stable callback for PoolInfo to report remoteToken changes */
  const handleRemoteTokenResolved = useCallback((rt: string | null) => {
    setPoolRemoteToken(rt);
  }, []);

  const recordSDKCall = useCallback(
    (method: string, args: Record<string, string>, result?: unknown, durationMs?: number) => {
      if (!inspectorStore.getSnapshot().enabled) return;
      const ann = getAnnotation(method);
      inspectorStore.addCall({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        phase: "setup",
        method,
        displayArgs: args,
        codeSnippet: ann.codeSnippet,
        annotation: ann.annotation,
        status: "success",
        result: serializeForDisplay(result),
        durationMs,
      });
    },
    []
  );

  const {
    feeTokens,
    selectedToken: feeToken,
    setSelectedToken: setFeeToken,
    isLoading: feeTokensLoading,
    error: feeTokensError,
  } = useFeeTokens(sourceNetworkId || null, routerAddress, walletAddress, getChain, {
    onSDKCall: recordSDKCall,
  });

  const {
    token,
    isLoading: balancesLoading,
    error: balancesError,
  } = useWalletBalances(
    sourceNetworkId || null,
    tokenAddress,
    walletAddress ?? null,
    getChain,
    TOKEN_SYMBOL,
    { onSDKCall: recordSDKCall, skipNative: true, skipLink: true }
  );

  /** Wallet address on the destination chain (for "send to myself") */
  const selfReceiverAddress = useMemo(
    () => getWalletAddress(destNetworkId || null, walletAddresses),
    [destNetworkId, walletAddresses]
  );

  useEffect(() => {
    if (useSelfAsReceiver) setReceiver(selfReceiverAddress ?? "");
  }, [useSelfAsReceiver, selfReceiverAddress]);

  const handleCopy = useCallback(() => {
    if (!receiver) return;
    copyToClipboard(receiver);
    setCopied(true);
    const resetDelayMs: number = COPIED_FEEDBACK_MS;
    setTimeout(() => setCopied(false), resetDelayMs);
  }, [receiver]);

  const sourceChainId = sourceNetworkId ? NETWORK_TO_CHAIN_ID[sourceNetworkId] : null;
  const needsChainSwitch =
    isEVM(sourceNetworkId) &&
    sourceChainId != null &&
    currentChainId != null &&
    currentChainId !== sourceChainId;

  const destFamily = destNetworkId ? networkInfo(destNetworkId).family : null;
  const isAmountValid = isValidAmount(amount);
  const isReceiverValid =
    destFamily != null && receiver.length > 0 && isValidAddress(receiver, destFamily);

  const canEstimate = Boolean(
    sourceNetworkId && destNetworkId && isAmountValid && isReceiverValid && tokenAddress && token
  );

  const canTransfer = canEstimate && !needsChainSwitch && feeFormatted;

  const balanceItems: BalanceItem[] = useMemo(() => {
    if (!token) return [];
    return [{ symbol: token.symbol, balance: token.formatted }];
  }, [token]);

  const handleEstimate = () => {
    if (canEstimate && token)
      void onEstimateFee(sourceNetworkId, destNetworkId, TOKEN_SYMBOL, amount, receiver, feeToken);
  };

  const handleTransfer = () => {
    if (canTransfer && token)
      void onTransfer(
        sourceNetworkId,
        destNetworkId,
        TOKEN_SYMBOL,
        amount,
        receiver,
        feeToken,
        poolRemoteToken
      );
  };

  const handleSwitchChain = () => {
    if (sourceChainId != null) onSwitchChain(sourceChainId);
  };

  return (
    <div className={styles.form}>
      <h2 className={styles.title}>Transfer Tokens</h2>

      <div className={styles.row}>
        <Select
          label="From Network"
          value={sourceNetworkId}
          onChange={(e) => handleSourceChange(e.target.value)}
          disabled={isLoading}
        >
          <option value="">Select network</option>
          {allNetworks.map(([id, config]) => (
            <option key={id} value={id}>
              {config.name} ({CHAIN_FAMILY_LABELS[networkInfo(id).family]})
            </option>
          ))}
        </Select>

        <Select
          label="To Network"
          value={destNetworkId}
          onChange={(e) => handleDestChange(e.target.value)}
          disabled={isLoading}
        >
          <option value="">Select network</option>
          {destNetworks.map(([id, config]) => (
            <option key={id} value={id}>
              {config.name} ({CHAIN_FAMILY_LABELS[networkInfo(id).family]})
            </option>
          ))}
        </Select>
      </div>

      {sourceNetworkId && (
        <FeeTokenOptions
          options={feeTokens}
          selected={feeToken}
          onChange={(token) => {
            setFeeToken(token);
            onClearEstimate();
          }}
          isLoading={feeTokensLoading}
          disabled={isLoading}
        />
      )}
      {feeTokensError && <Alert variant="warning">{feeTokensError}</Alert>}

      {sourceNetworkId && <BalancesList balances={balanceItems} isLoading={balancesLoading} />}

      <PoolInfo
        sourceNetworkId={sourceNetworkId || undefined}
        destNetworkId={destNetworkId || undefined}
        tokenAddress={tokenAddress ?? undefined}
        tokenDecimals={token?.decimals}
        tokenSymbol={TOKEN_SYMBOL}
        onRemoteTokenResolved={handleRemoteTokenResolved}
      />

      <div className={styles.tokenRow}>
        <Input label="Token" value={token ? token.symbol : TOKEN_SYMBOL} disabled />
      </div>
      {sourceNetworkId && !tokenAddress && (
        <Alert variant="error">Token not available on this network</Alert>
      )}
      {balancesError && <Alert variant="error">{balancesError}</Alert>}

      <div className={styles.amountRow}>
        <Input
          label="Amount"
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          disabled={isLoading || balancesLoading}
          error={amount && !isAmountValid ? "Enter a valid positive amount" : undefined}
        />
        <button
          type="button"
          className={styles.maxButton}
          onClick={() =>
            token?.balance != null
              ? setAmount(formatAmountFull(token.balance, token.decimals))
              : undefined
          }
          disabled={isLoading || balancesLoading || !token?.formatted}
          title="Use maximum balance"
        >
          Max
        </button>
      </div>

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={useSelfAsReceiver}
          onChange={(e) => setUseSelfAsReceiver(e.target.checked)}
          disabled={isLoading}
        />
        Send to myself
      </label>

      {!useSelfAsReceiver && (
        <div className={styles.receiverRow}>
          <Input
            label="Receiver Address"
            type="text"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder={getAddressPlaceholder(destFamily)}
            disabled={isLoading}
            error={
              receiver && destFamily != null && !isValidAddress(receiver, destFamily)
                ? "Enter a valid address for the destination chain"
                : undefined
            }
          />
          <button
            type="button"
            className={`${styles.copyButton} ${copied ? styles.copied : ""}`}
            onClick={() => void handleCopy()}
            disabled={!receiver || !isReceiverValid}
            title={copied ? "Copied!" : "Copy address"}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      )}

      {fee != null && feeToken && (
        <FeeEstimateDisplay
          fee={fee}
          feeToken={feeToken}
          balance={feeToken.balance}
          estimatedTime={estimatedTime}
        />
      )}

      <div className={styles.actions}>
        {needsChainSwitch && sourceConfig ? (
          <Button onClick={handleSwitchChain} variant="warning" disabled={isLoading}>
            Switch to {sourceConfig.name}
          </Button>
        ) : (
          <>
            <Button onClick={handleEstimate} disabled={!canEstimate} isLoading={isLoading}>
              Estimate Fee
            </Button>
            <Button
              onClick={handleTransfer}
              variant="success"
              disabled={!canTransfer}
              isLoading={isLoading}
            >
              Transfer
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
