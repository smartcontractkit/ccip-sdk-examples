/**
 * Balances list component
 *
 * Displays multiple token balances in a compact row format.
 * Shows loading skeletons for individual balances.
 */

import styles from "./BalancesList.module.css";

export interface BalanceItem {
  /** Token symbol (e.g., "ETH", "LINK", "CCIP-BnM") */
  symbol: string;
  /** Formatted balance string, null while loading */
  balance: string | null;
  /** Error message if balance fetch failed */
  error?: string;
}

export interface BalancesListProps {
  /** List of balances to display */
  balances: BalanceItem[];
  /** Whether the entire list is loading (initial load) */
  isLoading?: boolean;
}

export function BalancesList({ balances, isLoading = false }: BalancesListProps) {
  if (balances.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <span className={styles.label}>Balances:</span>
      <div className={styles.balances}>
        {balances.map((item) => (
          <div key={item.symbol} className={styles.balanceItem}>
            {isLoading || item.balance === null ? (
              <>
                <span className={styles.symbol}>{item.symbol}:</span>
                <span className={styles.skeletonBar} />
              </>
            ) : item.error ? (
              <>
                <span className={styles.symbol}>{item.symbol}:</span>
                <span className={styles.error} title={item.error}>
                  Error
                </span>
              </>
            ) : (
              <>
                <span className={styles.symbol}>{item.symbol}:</span>
                <strong className={styles.value}>{item.balance}</strong>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
