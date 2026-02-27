/**
 * Live source and destination pool rate limits during an in-progress transfer.
 * Two cards (source / destination), each with Outbound and Inbound via RateLimitDisplay.
 */

import { getNetwork } from "@ccip-examples/shared-config";
import { RateLimitDisplay } from "../bridge/RateLimitDisplay.js";
import { useTransferRateLimits } from "../../hooks/useTransferRateLimits.js";
import styles from "./TransferRateLimits.module.css";

export interface TransferRateLimitsProps {
  sourceNetworkId: string | null;
  destNetworkId: string | null;
  tokenAddress: string | null;
  isActive: boolean;
  tokenDecimals?: number;
  destTokenDecimals?: number;
  tokenSymbol?: string;
}

export function TransferRateLimits({
  sourceNetworkId,
  destNetworkId,
  tokenAddress,
  isActive,
  tokenDecimals = 18,
  destTokenDecimals,
  tokenSymbol = "tokens",
}: TransferRateLimitsProps) {
  const destDecimals = destTokenDecimals ?? tokenDecimals;
  const { sourceOutbound, sourceInbound, destOutbound, destInbound, isLoading, error } =
    useTransferRateLimits({
      sourceNetworkId,
      destNetworkId,
      tokenAddress,
      isActive,
    });

  const sourceNetwork = sourceNetworkId ? getNetwork(sourceNetworkId) : undefined;
  const destNetwork = destNetworkId ? getNetwork(destNetworkId) : undefined;
  const sourceLabel = sourceNetwork?.name ?? sourceNetworkId ?? "Source";
  const destLabel = destNetwork?.name ?? destNetworkId ?? "Destination";

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.error}>{error}</div>
        </div>
      </div>
    );
  }

  if (isLoading && !sourceOutbound && !sourceInbound && !destOutbound && !destInbound) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.label}>{sourceLabel}</div>
          <div className={styles.loading}>Loading rate limits…</div>
        </div>
        <div className={styles.card}>
          <div className={styles.label}>{destLabel}</div>
          <div className={styles.loading}>Loading rate limits…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.label}>{sourceLabel}</div>
        <div className={styles.rateLimits}>
          <RateLimitDisplay
            bucket={sourceOutbound}
            label="Outbound"
            decimals={tokenDecimals}
            symbol={tokenSymbol}
          />
          <RateLimitDisplay
            bucket={sourceInbound}
            label="Inbound"
            decimals={tokenDecimals}
            symbol={tokenSymbol}
          />
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.label}>{destLabel}</div>
        <div className={styles.rateLimits}>
          <RateLimitDisplay
            bucket={destOutbound}
            label="Outbound"
            decimals={destDecimals}
            symbol={tokenSymbol}
          />
          <RateLimitDisplay
            bucket={destInbound}
            label="Inbound"
            decimals={destDecimals}
            symbol={tokenSymbol}
          />
        </div>
      </div>
    </div>
  );
}
