/** Transfer history context. */

import { createContext } from "react";
import type { MessageSearchResult } from "@chainlink/ccip-sdk";

export interface TransactionHistoryContextValue {
  /** Messages sent by the active wallet, newest first. */
  messages: MessageSearchResult[];
  /** Every connected address the history is filtered on. */
  senders: string[];
  /** Loaded messages that have not reached a terminal status. */
  pendingCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  /** The API has another page. */
  hasMore: boolean;
  error: string | null;
  /** Append the next page. */
  loadMore: () => void;
  /** Discard and re-read from the first page. */
  refresh: () => void;

  isDrawerOpen: boolean;
  openDrawer: (triggerElement?: HTMLElement | null) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  /** Called after a transfer is broadcast. Schedules a refresh once the API has indexed it. */
  onTransferSent: () => void;
}

export const TransactionHistoryContext = createContext<TransactionHistoryContextValue>({
  messages: [],
  senders: [],
  pendingCount: 0,
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  error: null,
  loadMore: () => {},
  refresh: () => {},
  isDrawerOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
  onTransferSent: () => {},
});
