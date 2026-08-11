/**
 * Transfer history drawer and History button. Rows come from the CCIP API filtered by
 * every connected wallet. The Load more button duplicates the scroll sentinel for
 * keyboard users.
 */

import { useCallback, useContext, useEffect, useRef } from "react";

import { MessageHistoryItem } from "./MessageHistoryItem.js";
import { TransactionHistoryContext } from "../../hooks/transactionHistoryTypes.js";
import { truncateAddress } from "@chainlink/ccip-examples-shared-utils";
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

/** Pages in the next batch when the sentinel nears the viewport. */
function useInfiniteScroll(
  enabled: boolean,
  onReachEnd: () => void
): React.RefObject<HTMLDivElement> {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const armedRef = useRef(true);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!enabled || !node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            armedRef.current = true;
          } else if (armedRef.current) {
            // One page per approach. An appended page often leaves the sentinel
            // in view, and firing on every intersection pages through the whole
            // history unprompted.
            armedRef.current = false;
            onReachEnd();
          }
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onReachEnd]);

  return sentinelRef;
}

export function TransactionHistory() {
  const {
    messages,
    senders,
    pendingCount,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    isDrawerOpen,
    closeDrawer,
  } = useContext(TransactionHistoryContext);

  const drawerRef = useFocusTrap(isDrawerOpen, closeDrawer);
  const sentinelRef = useInfiniteScroll(isDrawerOpen && hasMore && !isLoadingMore, loadMore);

  if (!isDrawerOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={closeDrawer} aria-hidden="true" />

      <div
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Transfer History"
      >
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <h2 className={styles.title}>Transfer History</h2>
            {pendingCount > 0 && (
              <span className={styles.pendingBadge}>{pendingCount} in progress</span>
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
          {error !== null && (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Could not load history</p>
              <p className={styles.emptySubtext}>{error}</p>
              <button type="button" className={styles.clearButton} onClick={refresh}>
                Try again
              </button>
            </div>
          )}

          {error === null && senders.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyText}>No wallet connected</p>
              <p className={styles.emptySubtext}>Connect a wallet to see its transfers</p>
            </div>
          )}

          {error === null && senders.length > 0 && isLoading && messages.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Loading transfers…</p>
            </div>
          )}

          {error === null && senders.length > 0 && !isLoading && messages.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyText}>No transfers yet</p>
              <p className={styles.emptySubtext}>
                Cross-chain transfers from this wallet appear here
              </p>
            </div>
          )}

          {messages.length > 0 && (
            <div className={styles.list}>
              {messages.map((message) => (
                <MessageHistoryItem key={message.messageId} message={message} />
              ))}

              <div ref={sentinelRef} aria-hidden="true" />

              {hasMore && (
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={loadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? "Loading…" : "Load more"}
                </button>
              )}

              {!hasMore && <p className={styles.footerNote}>End of history</p>}
            </div>
          )}
        </div>

        {senders.length > 0 && (
          <div className={styles.footer}>
            <button type="button" className={styles.clearButton} onClick={refresh}>
              Refresh
            </button>
            <p className={styles.footerNote}>
              From the CCIP API for {senders.map((s) => truncateAddress(s, 4)).join(", ")}
            </p>
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
      aria-label="Open transfer history"
    >
      <span className={styles.historyLabel}>History</span>
      {pendingCount > 0 && <span className={styles.historyBadge}>{pendingCount}</span>}
    </button>
  );
}
