/**
 * Bridge transfer form
 *
 * Main form component for initiating cross-chain transfers.
 * Fee payment via useFeeTokens + FeeTokenOptions (native + LINK).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { networkInfo, ChainFamily } from "@chainlink/ccip-sdk";
import { NETWORKS, getTokenAddress, type FeeTokenOptionItem } from "@ccip-examples/shared-config";
import {
  isValidEVMAddress,
  isValidAmount,
  formatAmountFull,
  copyToClipboard,
  COPIED_FEEDBACK_MS,
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
import { useGetChain } from "../../hooks/useGetChain.js";
import { NETWORK_TO_CHAIN_ID } from "@ccip-examples/shared-config/wagmi";
import styles from "@ccip-examples/shared-components/bridge/BridgeForm.module.css";

/** Fixed token symbol for this bridge example */
const TOKEN_SYMBOL = "CCIP-BnM";

interface BridgeFormProps {
  walletAddress: string | null;
  currentChainId: number | null;
  fee: bigint | null;
  feeFormatted: string | null;
  estimatedTime: string | null;
  isLoading: boolean;
  onEstimateFee: (
    sourceNetwork: string,
    destNetwork: string,
    token: string,
    amount: string,
    receiver: string,
    feeToken: FeeTokenOptionItem | null
  ) => Promise<void>;
  onTransfer: (
    sourceNetwork: string,
    destNetwork: string,
    token: string,
    amount: string,
    receiver: string,
    feeToken: FeeTokenOptionItem | null
  ) => Promise<void>;
  onSwitchChain: (chainId: number) => void;
  onClearEstimate: () => void;
  onReset: () => void;
}

export function BridgeForm({
  walletAddress,
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
  const [sourceNetwork, setSourceNetwork] = useState("");
  const [destNetwork, setDestNetwork] = useState("");
  const [amount, setAmount] = useState("");
  const [receiver, setReceiver] = useState("");
  const [useSelfAsReceiver, setUseSelfAsReceiver] = useState(true);
  const [copied, setCopied] = useState(false);

  const getChain = useGetChain();

  /** Clear stale transfer result + fee when the user changes networks */
  const handleSourceChange = useCallback(
    (id: string) => {
      setSourceNetwork(id);
      onReset();
      onClearEstimate();
    },
    [onReset, onClearEstimate]
  );

  const handleDestChange = useCallback(
    (id: string) => {
      setDestNetwork(id);
      onReset();
      onClearEstimate();
    },
    [onReset, onClearEstimate]
  );

  const sourceConfig = sourceNetwork ? NETWORKS[sourceNetwork] : null;
  const routerAddress = sourceConfig?.routerAddress ?? null;

  const allEVMNetworks = useMemo(() => {
    return Object.entries(NETWORKS).filter(([key]) => {
      return networkInfo(key).family === ChainFamily.EVM && NETWORK_TO_CHAIN_ID[key];
    });
  }, []);

  const destNetworks = useMemo(() => {
    return allEVMNetworks.filter(([key]) => key !== sourceNetwork);
  }, [allEVMNetworks, sourceNetwork]);

  const handleCopyAddress = useCallback(() => {
    if (!receiver) return;
    copyToClipboard(receiver);
    setCopied(true);
    const resetDelayMs: number = COPIED_FEEDBACK_MS;
    setTimeout(() => setCopied(false), resetDelayMs);
  }, [receiver]);

  const tokenAddress = sourceNetwork ? getTokenAddress(TOKEN_SYMBOL, sourceNetwork) : null;

  const {
    feeTokens,
    selectedToken: feeToken,
    setSelectedToken: setFeeToken,
    isLoading: feeTokensLoading,
    error: feeTokensError,
  } = useFeeTokens(sourceNetwork || null, routerAddress, walletAddress, getChain);

  const {
    token,
    isLoading: balancesLoading,
    error: balancesError,
  } = useWalletBalances(
    sourceNetwork || null,
    tokenAddress ?? null,
    walletAddress,
    getChain,
    TOKEN_SYMBOL
  );

  // Auto-populate receiver with wallet address
  useEffect(() => {
    if (useSelfAsReceiver && walletAddress) {
      setReceiver(walletAddress);
    }
  }, [useSelfAsReceiver, walletAddress]);

  const tokenAvailable = Boolean(tokenAddress);

  // Check if chain switch is needed (use mapping instead of config.chainId)
  const sourceChainId = sourceNetwork ? NETWORK_TO_CHAIN_ID[sourceNetwork] : null;
  const needsChainSwitch = sourceChainId && currentChainId && currentChainId !== sourceChainId;

  // Validation
  const isAmountValid = isValidAmount(amount);
  const isReceiverValid = isValidEVMAddress(receiver);

  const canEstimate = Boolean(
    sourceNetwork && destNetwork && isAmountValid && isReceiverValid && tokenAvailable && token
  );

  const canTransfer = canEstimate && !needsChainSwitch && feeFormatted;

  const balanceItems: BalanceItem[] = useMemo(() => {
    if (!token) return [];
    return [{ symbol: token.symbol, balance: token.formatted }];
  }, [token]);

  // Handlers
  const handleEstimate = () => {
    if (canEstimate && token) {
      void onEstimateFee(sourceNetwork, destNetwork, TOKEN_SYMBOL, amount, receiver, feeToken);
    }
  };

  const handleTransfer = () => {
    if (canTransfer && token) {
      void onTransfer(sourceNetwork, destNetwork, TOKEN_SYMBOL, amount, receiver, feeToken);
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
          onChange={(e) => handleSourceChange(e.target.value)}
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
          onChange={(e) => handleDestChange(e.target.value)}
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

      {sourceNetwork && (
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

      {sourceNetwork && <BalancesList balances={balanceItems} isLoading={balancesLoading} />}

      {/* Token (fixed) */}
      <div className={styles.tokenRow}>
        <Input label="Token" value={token ? token.symbol : TOKEN_SYMBOL} disabled />
      </div>
      {sourceNetwork && !tokenAvailable && (
        <Alert variant="error">Token not available on this network</Alert>
      )}
      {balancesError && <Alert variant="error">{balancesError}</Alert>}

      {/* Amount with Max button */}
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

      {fee != null && feeToken && (
        <FeeEstimateDisplay
          fee={fee}
          feeToken={feeToken}
          balance={feeToken.balance}
          estimatedTime={estimatedTime}
        />
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
