/**
 * Transaction history provider: localStorage persistence and parallel status polling.
 * Uses Promise.allSettled for pending items and AbortController for cleanup.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MessageStatus } from "@chainlink/ccip-sdk";
import { useChains } from "./useChains.js";
import {
  TransactionHistoryContext as Ctx,
  type TransactionHistoryContextValue,
} from "./transactionHistoryTypes.js";
import {
  getStoredTransactions,
  addTransaction as addToStorage,
  updateTransactionStatus,
  getPendingTransactions,
  removeTransaction as removeFromStorage,
  clearAllTransactions,
  type TransactionStatus as TxStatus,
} from "../utils/localStorage.js";

const POLLING_INTERVAL = 30_000;

export function TransactionHistoryProvider({ children }: { children: ReactNode }) {
  const { getChain } = useChains();
  const [transactions, setTransactions] = useState(getStoredTransactions());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    setTransactions(getStoredTransactions());
  }, []);

  const pollPendingTransactions = useCallback(async () => {
    const pending = getPendingTransactions();
    if (pending.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const pollOne = async (tx: (typeof pending)[number]) => {
      if (signal.aborted) return;
      try {
        const chain = await getChain(tx.sourceNetwork);
        // Ref/signal can change during async; runtime checks kept intentionally
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async timing
        if (chain == null || signal.aborted) return;

        const message = await chain.getMessageById(tx.messageId);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async timing
        if (signal.aborted) return;

        const status = message.metadata?.status;
        let newStatus: TxStatus = "pending";
        let destTxHash: string | undefined;

        if (status === MessageStatus.Success) {
          newStatus = "success";
          destTxHash = message.metadata?.receiptTransactionHash;
        } else if (status === MessageStatus.Failed) {
          newStatus = "failed";
          destTxHash = message.metadata?.receiptTransactionHash;
        }

        if (newStatus !== "pending") {
          updateTransactionStatus(tx.messageId, newStatus, destTxHash);
        }
      } catch (err) {
        console.debug("Background polling error for", tx.messageId, err);
      }
    };

    await Promise.allSettled(pending.map((tx) => pollOne(tx)));
    abortRef.current = null;

    if (signal.aborted) return;
    refresh();
  }, [getChain, refresh]);

  useEffect(() => {
    void pollPendingTransactions();
    intervalRef.current = setInterval(() => void pollPendingTransactions(), POLLING_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [pollPendingTransactions]);

  const openDrawer = useCallback((triggerElement?: HTMLElement | null) => {
    if (triggerElement) triggerElementRef.current = triggerElement;
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    if (triggerElementRef.current) {
      triggerElementRef.current.focus();
      triggerElementRef.current = null;
    }
  }, []);

  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  const addTransaction = useCallback(
    (tx: {
      messageId: string;
      txHash: string;
      sourceNetwork: string;
      destNetwork: string;
      amount: string;
      tokenSymbol: string;
      receiver: string;
      sender: string;
    }) => {
      addToStorage({ ...tx, status: "pending" });
      refresh();
    },
    [refresh]
  );

  const removeTransaction = useCallback(
    (messageId: string) => {
      removeFromStorage(messageId);
      refresh();
    },
    [refresh]
  );

  const clearHistory = useCallback(() => {
    clearAllTransactions();
    refresh();
  }, [refresh]);

  const pendingCount = transactions.filter((t) => t.status === "pending").length;

  const value: TransactionHistoryContextValue = {
    transactions,
    pendingCount,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    addTransaction,
    removeTransaction,
    clearHistory,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
