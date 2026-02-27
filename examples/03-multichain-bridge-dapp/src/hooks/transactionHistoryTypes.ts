/**
 * Transaction history context and types.
 */

import { createContext } from "react";
import type { StoredTransaction } from "../utils/localStorage.js";

export interface TransactionHistoryContextValue {
  transactions: StoredTransaction[];
  pendingCount: number;
  isDrawerOpen: boolean;
  openDrawer: (triggerElement?: HTMLElement | null) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  addTransaction: (tx: {
    messageId: string;
    txHash: string;
    sourceNetwork: string;
    destNetwork: string;
    amount: string;
    tokenSymbol: string;
    receiver: string;
    sender: string;
  }) => void;
  removeTransaction: (messageId: string) => void;
  clearHistory: () => void;
  refresh: () => void;
}

export const TransactionHistoryContext = createContext<TransactionHistoryContextValue>({
  transactions: [],
  pendingCount: 0,
  isDrawerOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
  addTransaction: () => {},
  removeTransaction: () => {},
  clearHistory: () => {},
  refresh: () => {},
});
