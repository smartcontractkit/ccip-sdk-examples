/**
 * Pool info: type, addresses, rate limits (collapsible).
 * Calls useTokenPoolInfo internally and reports remoteToken via callback.
 */

import { useState, useEffect } from "react";
import { useTokenPoolInfo, type TokenPoolInfo } from "../../hooks/useTokenPoolInfo.js";
import { RateLimitDisplay } from "./RateLimitDisplay.js";
import { truncateAddress, copyToClipboard } from "@ccip-examples/shared-utils";
import styles from "./PoolInfo.module.css";

export type { TokenPoolInfo };

interface PoolInfoProps {
  sourceNetworkId: string | undefined;
  destNetworkId: string | undefined;
  tokenAddress: string | undefined;
  tokenDecimals?: number;
  tokenSymbol?: string;
  /** Called whenever remoteToken is resolved (or becomes null) */
  onRemoteTokenResolved?: (remoteToken: string | null) => void;
}

export function PoolInfo({
  sourceNetworkId,
  destNetworkId,
  tokenAddress,
  tokenDecimals = 18,
  tokenSymbol = "tokens",
  onRemoteTokenResolved,
}: PoolInfoProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { poolInfo, remoteToken, isLaneSupported, isLoading, error } = useTokenPoolInfo(
    sourceNetworkId,
    destNetworkId,
    tokenAddress,
    tokenSymbol
  );

  // Report remoteToken changes to parent
  useEffect(() => {
    onRemoteTokenResolved?.(remoteToken);
  }, [remoteToken, onRemoteTokenResolved]);

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
              const rt = poolInfo.remoteToken;
              return (
                <div className={styles.row}>
                  <span className={styles.rowLabel}>Remote Token</span>
                  <button
                    type="button"
                    className={styles.copyable}
                    onClick={() => copyToClipboard(rt)}
                    title="Copy"
                  >
                    {truncateAddress(rt, 8)}
                  </button>
                </div>
              );
            })()}
          <div className={styles.rateLimits}>
            <span className={styles.rateLimitsLabel}>Rate Limits</span>
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
