/**
 * Bridge transfer form
 *
 * Main form component for initiating cross-chain transfers.
 * Split into logical sections for clarity:
 * - Network selection
 * - Token balance display (from SDK)
 * - Amount input
 * - Receiver address
 * - Fee display
 * - Submit actions
 *
 * Token metadata and balance are fetched from the SDK via useTokenInfo hook.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import { NETWORKS, getTokenAddress } from "@ccip-examples/shared-config";
import { isValidEVMAddress, isValidAmount } from "@ccip-examples/shared-utils";
import { Select, Input, Button, Alert } from "../ui";
import { useTokenInfo } from "../../hooks";
import { NETWORK_TO_CHAIN_ID } from "../../config/wagmi.js";
import styles from "./BridgeForm.module.css";

/** Fixed token symbol for this bridge example */
const TOKEN_SYMBOL = "CCIP-BnM";

/** Copy icon SVG */
function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** Check icon SVG for copied state */
function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

interface BridgeFormProps {
  walletAddress: string | null;
  currentChainId: number | null;
  feeFormatted: string | null;
  estimatedTime: string | null;
  isLoading: boolean;
  onEstimateFee: (
    sourceNetwork: string,
    destNetwork: string,
    token: string,
    amount: string,
    receiver: string
  ) => Promise<void>;
  onTransfer: (
    sourceNetwork: string,
    destNetwork: string,
    token: string,
    amount: string,
    receiver: string
  ) => Promise<void>;
  onSwitchChain: (chainId: number) => void;
}

export function BridgeForm({
  walletAddress,
  currentChainId,
  feeFormatted,
  estimatedTime,
  isLoading,
  onEstimateFee,
  onTransfer,
  onSwitchChain,
}: BridgeFormProps) {
  // Form state
  const [sourceNetwork, setSourceNetwork] = useState("");
  const [destNetwork, setDestNetwork] = useState("");
  const [amount, setAmount] = useState("");
  const [receiver, setReceiver] = useState("");
  const [useSelfAsReceiver, setUseSelfAsReceiver] = useState(true);
  const [copied, setCopied] = useState(false);

  // Memoize EVM networks to avoid recalculating on every render
  const allEVMNetworks = useMemo(() => {
    return Object.entries(NETWORKS).filter(([key]) => {
      return networkInfo(key).family === ChainFamily.EVM && NETWORK_TO_CHAIN_ID[key];
    });
  }, []);

  const destNetworks = useMemo(() => {
    return allEVMNetworks.filter(([key]) => key !== sourceNetwork);
  }, [allEVMNetworks, sourceNetwork]);

  /**
   * Copy receiver address to clipboard
   */
  const handleCopyAddress = useCallback(async () => {
    if (!receiver) return;
    try {
      await navigator.clipboard.writeText(receiver);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [receiver]);

  // Get token address for selected network
  const tokenAddress = sourceNetwork ? getTokenAddress(TOKEN_SYMBOL, sourceNetwork) : null;

  // Fetch token info and balance from SDK
  const {
    tokenInfo,
    balanceFormatted,
    isLoading: tokenLoading,
    error: tokenError,
  } = useTokenInfo(sourceNetwork || null, tokenAddress ?? null, walletAddress);

  // Auto-populate receiver with wallet address
  useEffect(() => {
    if (useSelfAsReceiver && walletAddress) {
      setReceiver(walletAddress);
    }
  }, [useSelfAsReceiver, walletAddress]);

  // Get network configs
  const sourceConfig = sourceNetwork ? NETWORKS[sourceNetwork] : null;
  const tokenAvailable = Boolean(tokenAddress);

  // Check if chain switch is needed (use mapping instead of config.chainId)
  const sourceChainId = sourceNetwork ? NETWORK_TO_CHAIN_ID[sourceNetwork] : null;
  const needsChainSwitch = sourceChainId && currentChainId && currentChainId !== sourceChainId;

  // Validation
  const isAmountValid = isValidAmount(amount);
  const isReceiverValid = isValidEVMAddress(receiver);

  const canEstimate = Boolean(
    sourceNetwork && destNetwork && isAmountValid && isReceiverValid && tokenAvailable && tokenInfo
  );

  const canTransfer = canEstimate && !needsChainSwitch && feeFormatted;

  // Handlers
  const handleEstimate = () => {
    if (canEstimate && tokenInfo) {
      void onEstimateFee(sourceNetwork, destNetwork, TOKEN_SYMBOL, amount, receiver);
    }
  };

  const handleTransfer = () => {
    if (canTransfer && tokenInfo) {
      void onTransfer(sourceNetwork, destNetwork, TOKEN_SYMBOL, amount, receiver);
    }
  };

  const handleSwitchChain = () => {
    if (sourceChainId) {
      onSwitchChain(sourceChainId);
    }
  };

  return (
    <div className={styles.form}>
      <h2 className={styles.title}>Transfer Tokens</h2>

      {/* Network Selection */}
      <div className={styles.row}>
        <Select
          label="From Network"
          value={sourceNetwork}
          onChange={(e) => setSourceNetwork(e.target.value)}
          disabled={isLoading}
        >
          <option value="">Select network</option>
          {allEVMNetworks.map(([key, config]) => (
            <option key={key} value={key}>
              {config.name}
            </option>
          ))}
        </Select>

        <Select
          label="To Network"
          value={destNetwork}
          onChange={(e) => setDestNetwork(e.target.value)}
          disabled={isLoading}
        >
          <option value="">Select network</option>
          {destNetworks.map(([key, config]) => (
            <option key={key} value={key}>
              {config.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Token (fixed) with balance display */}
      <div className={styles.tokenRow}>
        <Input label="Token" value={tokenInfo ? tokenInfo.symbol : TOKEN_SYMBOL} disabled />
        {/* Balance: show skeleton while loading, value when loaded */}
        {sourceNetwork && tokenLoading && (
          <div className={styles.balanceSkeleton}>
            Balance: <span className={styles.skeletonBar} />
          </div>
        )}
        {tokenInfo && balanceFormatted && !tokenLoading && (
          <div className={styles.balance}>
            Balance: <strong>{balanceFormatted}</strong> {tokenInfo.symbol}
          </div>
        )}
      </div>
      {sourceNetwork && !tokenAvailable && (
        <Alert variant="error">Token not available on this network</Alert>
      )}
      {tokenError && <Alert variant="error">{tokenError}</Alert>}

      {/* Amount with Max button */}
      <div className={styles.amountRow}>
        <Input
          label="Amount"
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          disabled={isLoading || tokenLoading}
          error={amount && !isAmountValid ? "Enter a valid positive amount" : undefined}
        />
        <button
          type="button"
          className={styles.maxButton}
          onClick={() => balanceFormatted && setAmount(balanceFormatted)}
          disabled={isLoading || tokenLoading || !balanceFormatted}
          title="Use maximum balance"
        >
          Max
        </button>
      </div>

      {/* Receiver */}
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
            placeholder="0x..."
            disabled={isLoading}
            error={receiver && !isReceiverValid ? "Enter a valid EVM address" : undefined}
          />
          <button
            type="button"
            className={`${styles.copyButton} ${copied ? styles.copied : ""}`}
            onClick={() => void handleCopyAddress()}
            disabled={!receiver || !isReceiverValid}
            title={copied ? "Copied!" : "Copy address"}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      )}

      {/* Fee Display */}
      {feeFormatted && sourceConfig && (
        <Alert variant="info">
          <strong>Estimated Fee:</strong> {feeFormatted} {sourceConfig.nativeCurrency.symbol}
          {estimatedTime && (
            <>
              {" "}
              &middot; <strong>Delivery:</strong> {estimatedTime}
            </>
          )}
        </Alert>
      )}

      {/* Actions */}
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
