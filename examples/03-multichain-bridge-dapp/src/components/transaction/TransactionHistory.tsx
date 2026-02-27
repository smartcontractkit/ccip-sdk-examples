/**
 * Transaction history drawer and History button.
 */

import { useEffect, useRef, useCallback, useContext } from "react";
import { TransactionHistoryItem } from "./TransactionHistoryItem.js";
import { TransactionHistoryContext } from "../../hooks/transactionHistoryTypes.js";
import styles from "./TransactionHistory.module.css";

function useFocusTrap(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const focusable = containerRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] as HTMLElement | undefined;
    const last = focusable[focusable.length - 1] as HTMLElement | undefined;

    first?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return containerRef;
}

export function TransactionHistory() {
  const { transactions, pendingCount, isDrawerOpen, closeDrawer, removeTransaction, clearHistory } =
    useContext(TransactionHistoryContext);

  const drawerRef = useFocusTrap(isDrawerOpen, closeDrawer);

  if (!isDrawerOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={closeDrawer} aria-hidden="true" />

      <div
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction History"
      >
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <h2 className={styles.title}>Transaction History</h2>
            {pendingCount > 0 && (
              <span className={styles.pendingBadge}>{pendingCount} pending</span>
            )}
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={closeDrawer}
            aria-label="Close history"
          >
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {transactions.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>No transactions yet</p>
              <p className={styles.emptySubtext}>Your cross-chain transfers will appear here</p>
            </div>
          ) : (
            <div className={styles.list}>
              {transactions.map((tx) => (
                <TransactionHistoryItem
                  key={tx.messageId}
                  transaction={tx}
                  onRemove={removeTransaction}
                />
              ))}
            </div>
          )}
        </div>

        {transactions.length > 0 && (
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => {
                if (window.confirm("Clear all transaction history?")) clearHistory();
              }}
            >
              Clear History
            </button>
            <p className={styles.footerNote}>Stored locally in your browser</p>
          </div>
        )}
      </div>
    </>
  );
}

export function HistoryButton() {
  const { pendingCount, openDrawer } = useContext(TransactionHistoryContext);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    openDrawer(buttonRef.current ?? undefined);
  }, [openDrawer]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.historyButton}
      onClick={handleClick}
      aria-label="Open transaction history"
    >
      <span className={styles.historyLabel}>History</span>
      {pendingCount > 0 && <span className={styles.historyBadge}>{pendingCount}</span>}
    </button>
  );
}
