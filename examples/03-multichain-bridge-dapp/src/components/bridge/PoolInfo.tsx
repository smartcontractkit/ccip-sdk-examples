/**
 * Pool info: type, addresses, rate limits (collapsible).
 */

import { useState } from "react";
import { useTokenPoolInfo } from "../../hooks/useTokenPoolInfo.js";
import { RateLimitDisplay } from "./RateLimitDisplay.js";
import { truncateAddress, copyToClipboard } from "@ccip-examples/shared-utils";
import styles from "./PoolInfo.module.css";

interface PoolInfoProps {
  sourceNetworkId: string | undefined;
  destNetworkId: string | undefined;
  tokenAddress: string | undefined;
  tokenDecimals?: number;
  tokenSymbol?: string;
}

export function PoolInfo({
  sourceNetworkId,
  destNetworkId,
  tokenAddress,
  tokenDecimals = 18,
  tokenSymbol = "tokens",
}: PoolInfoProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { poolInfo, isLaneSupported, isLoading, error } = useTokenPoolInfo(
    sourceNetworkId,
    destNetworkId,
    tokenAddress
  );

  if (!sourceNetworkId || !destNetworkId || !tokenAddress) return null;

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.skeleton}>Loading pool info...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <span>Could not load pool information</span>
        </div>
      </div>
    );
  }

  if (!isLaneSupported && poolInfo) {
    return (
      <div className={`${styles.container} ${styles.warning}`}>
        <div className={styles.warningContent}>
          <strong>Lane Not Supported</strong>
          <p>This token cannot be transferred on the selected route.</p>
        </div>
      </div>
    );
  }

  if (!poolInfo) return null;

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className={styles.headerTitle}>Pool Info</span>
        <span className={styles.poolType}>{poolInfo.typeAndVersion}</span>
        <span className={`${styles.chevron} ${isExpanded ? styles.expanded : ""}`}>
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>

      {isExpanded && (
        <div className={styles.content}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Pool Address</span>
            <button
              type="button"
              className={styles.copyable}
              onClick={() => copyToClipboard(poolInfo.poolAddress)}
              title="Copy"
            >
              {truncateAddress(poolInfo.poolAddress, 8)}
            </button>
          </div>
          {poolInfo.remoteToken != null &&
            (() => {
              const remoteToken = poolInfo.remoteToken;
              return (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>Remote Token</span>
                  <button
                    type="button"
                    className={styles.copyable}
                    onClick={() => copyToClipboard(remoteToken)}
                    title="Copy"
                  >
                    {truncateAddress(remoteToken, 8)}
                  </button>
                </div>
              );
            })()}
          <div className={styles.rateLimits}>
            <RateLimitDisplay
              bucket={poolInfo.outboundRateLimit}
              label="Outbound"
              decimals={tokenDecimals}
              symbol={tokenSymbol}
            />
            <RateLimitDisplay
              bucket={poolInfo.inboundRateLimit}
              label="Inbound"
              decimals={tokenDecimals}
              symbol={tokenSymbol}
            />
          </div>
        </div>
      )}
    </div>
  );
}
