/**
 * Fee token selector with balances (replaces FeeTokenSelector).
 * Radio list: symbol + formatted balance per token; chain-agnostic (address = native vs token).
 */

import type { FeeTokenOptionItem } from "@ccip-examples/shared-config";
import styles from "./FeeTokenOptions.module.css";

export interface FeeTokenOptionsProps {
  options: FeeTokenOptionItem[];
  selected: FeeTokenOptionItem | null;
  onChange: (option: FeeTokenOptionItem) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function FeeTokenOptions({
  options,
  selected,
  onChange,
  isLoading,
  disabled = false,
}: FeeTokenOptionsProps) {
  if (isLoading) {
    return (
      <div className={styles.container}>
        <span className={styles.label}>Pay fees in</span>
        <div className={styles.loading}>Loading fee options…</div>
      </div>
    );
  }

  if (options.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <span className={styles.label}>Pay fees in</span>
      <div className={styles.options}>
        {options.map((option) => {
          const isSelected =
            selected !== null && (option.address ?? "") === (selected.address ?? "");
          const balanceKnown = option.balance !== null;
          const hasBalance = option.balance === null || option.balance > 0n;
          const optionDisabled = disabled || (balanceKnown && !hasBalance);

          const isNative = option.address === undefined;

          return (
            <label
              key={option.address ?? "native"}
              className={`${styles.option} ${isSelected ? styles.selected : ""} ${optionDisabled ? styles.disabled : ""}`}
              title={balanceKnown && !hasBalance ? "Insufficient balance" : undefined}
            >
              <div className={styles.optionContent}>
                <span className={styles.optionTopRow}>
                  <span className={styles.optionSymbol}>{option.symbol}</span>
                  {isNative && <span className={styles.nativeBadge}>Native</span>}
                </span>
                <span className={styles.optionBottomRow}>
                  {option.name && (
                    <>
                      <span className={styles.optionName}>{option.name}</span>
                      <span className={styles.optionSeparator}>&middot;</span>
                    </>
                  )}
                  <span>{option.balanceFormatted} available</span>
                </span>
              </div>
              <input
                type="radio"
                name="feeToken"
                value={option.address ?? "native"}
                checked={isSelected}
                onChange={() => onChange(option)}
                disabled={optionDisabled}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
