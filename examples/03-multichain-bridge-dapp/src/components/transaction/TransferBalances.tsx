/**
 * Live source and destination balances during an in-progress transfer.
 * Two cards; uses useTransferBalances and shared formatAmount / NETWORKS.
 */

import { getNetwork } from "@ccip-examples/shared-config";
import { formatAmount } from "@ccip-examples/shared-utils";
import { useTransferBalances } from "../../hooks/useTransferBalances.js";
import styles from "./TransferBalances.module.css";

export interface TransferBalancesProps {
  sourceNetworkId: string | null;
  destNetworkId: string | null;
  senderAddress: string | null;
  receiverAddress: string | null;
  tokenAddress: string | null;
  isActive: boolean;
  tokenDecimals?: number;
  /** Token decimals on destination chain (may differ from source, e.g. 9 vs 18) */
  destTokenDecimals?: number;
  /** For "before vs after" display */
  initialSourceBalance?: bigint | null;
  /** For "before vs after" display */
  initialDestBalance?: bigint | null;
}

function formatBalance(
  balance: bigint | null,
  decimals: number,
  loading: boolean,
  error: string | null
): string {
  if (error) return "—";
  if (loading && balance === null) return "Loading…";
  if (balance === null) return "—";
  return formatAmount(balance, decimals);
}

export function TransferBalances({
  sourceNetworkId,
  destNetworkId,
  senderAddress,
  receiverAddress,
  tokenAddress,
  isActive,
  tokenDecimals = 18,
  destTokenDecimals,
  initialSourceBalance,
  initialDestBalance,
}: TransferBalancesProps) {
  const destDecimals = destTokenDecimals ?? tokenDecimals;
  const { sourceBalance, destBalance, sourceLoading, destLoading, sourceError, destError } =
    useTransferBalances({
      sourceNetworkId,
      destNetworkId,
      senderAddress,
      receiverAddress,
      tokenAddress,
      isActive,
      tokenDecimals,
      initialSourceBalance,
      initialDestBalance,
    });

  const sourceNetwork = sourceNetworkId ? getNetwork(sourceNetworkId) : undefined;
  const destNetwork = destNetworkId ? getNetwork(destNetworkId) : undefined;
  const sourceLabel = sourceNetwork?.name ?? sourceNetworkId ?? "Source";
  const destLabel = destNetwork?.name ?? destNetworkId ?? "Destination";

  const showSourceBefore = initialSourceBalance != null;
  const showDestBefore = initialDestBalance != null;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.label}>{sourceLabel}</div>
        {showSourceBefore && (
          <div className={styles.before}>
            Before: {formatAmount(initialSourceBalance, tokenDecimals)}
          </div>
        )}
        <div className={sourceLoading && sourceBalance === null ? styles.loading : styles.balance}>
          {formatBalance(sourceBalance, tokenDecimals, sourceLoading, sourceError)}
        </div>
        {sourceError && <div className={styles.error}>{sourceError}</div>}
      </div>
      <div className={styles.card}>
        <div className={styles.label}>{destLabel}</div>
        {showDestBefore && (
          <div className={styles.before}>
            Before: {formatAmount(initialDestBalance, destDecimals)}
          </div>
        )}
        <div className={destLoading && destBalance === null ? styles.loading : styles.balance}>
          {formatBalance(destBalance, destDecimals, destLoading, destError)}
        </div>
        {destError && <div className={styles.error}>{destError}</div>}
      </div>
    </div>
  );
}
