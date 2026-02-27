/**
 * LocalStorage utilities for transaction history.
 * Schema versioning and safe parse; used by TransactionHistoryContext.
 */

const STORAGE_PREFIX = "ccip-examples-03:";
const SCHEMA_VERSION = 1;
const MAX_TRANSACTIONS = 50;

export type TransactionStatus = "pending" | "success" | "failed" | "timeout";

export interface StoredTransaction {
  messageId: string;
  txHash: string;
  destTxHash?: string;
  sourceNetwork: string;
  destNetwork: string;
  amount: string;
  tokenSymbol: string;
  receiver: string;
  sender: string;
  status: TransactionStatus;
  timestamp: number;
  lastChecked: number;
}

interface StorageData {
  version: number;
  transactions: StoredTransaction[];
}

function getStorageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function isLocalStorageAvailable(): boolean {
  try {
    const testKey = `${STORAGE_PREFIX}test`;
    localStorage.setItem(testKey, "test");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function getStoredTransactions(): StoredTransaction[] {
  if (!isLocalStorageAvailable()) return [];

  const key = getStorageKey("transactions");
  const raw = localStorage.getItem(key);
  const data = safeParse<StorageData>(raw, { version: 0, transactions: [] });

  if (data.version !== SCHEMA_VERSION) {
    return [];
  }

  return data.transactions;
}

function saveTransactions(transactions: StoredTransaction[]): void {
  if (!isLocalStorageAvailable()) return;

  const key = getStorageKey("transactions");
  const data: StorageData = {
    version: SCHEMA_VERSION,
    transactions: transactions.slice(0, MAX_TRANSACTIONS),
  };

  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    data.transactions = transactions.slice(0, Math.floor(MAX_TRANSACTIONS / 2));
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      console.error("Failed to save transactions to localStorage");
    }
  }
}

export function addTransaction(
  transaction: Omit<StoredTransaction, "timestamp" | "lastChecked">
): void {
  const transactions = getStoredTransactions();
  const existingIndex = transactions.findIndex((t) => t.messageId === transaction.messageId);

  if (existingIndex !== -1) {
    const existing = transactions.at(existingIndex);
    if (existing) {
      transactions[existingIndex] = {
        ...existing,
        ...transaction,
        lastChecked: Date.now(),
      };
    }
  } else {
    const newTx: StoredTransaction = {
      ...transaction,
      timestamp: Date.now(),
      lastChecked: Date.now(),
    };
    transactions.unshift(newTx);
  }

  saveTransactions(transactions);
}

export function updateTransactionStatus(
  messageId: string,
  status: TransactionStatus,
  destTxHash?: string
): void {
  const transactions = getStoredTransactions();
  const index = transactions.findIndex((t) => t.messageId === messageId);

  if (index !== -1) {
    const existing = transactions.at(index);
    if (existing) {
      transactions[index] = {
        ...existing,
        status,
        destTxHash: destTxHash ?? existing.destTxHash,
        lastChecked: Date.now(),
      };
      saveTransactions(transactions);
    }
  }
}

export function getTransaction(messageId: string): StoredTransaction | undefined {
  return getStoredTransactions().find((t) => t.messageId === messageId);
}

export function getPendingTransactions(): StoredTransaction[] {
  return getStoredTransactions().filter((t) => t.status === "pending");
}

export function removeTransaction(messageId: string): void {
  const transactions = getStoredTransactions().filter((t) => t.messageId !== messageId);
  saveTransactions(transactions);
}

export function clearAllTransactions(): void {
  if (!isLocalStorageAvailable()) return;
  localStorage.removeItem(getStorageKey("transactions"));
}
