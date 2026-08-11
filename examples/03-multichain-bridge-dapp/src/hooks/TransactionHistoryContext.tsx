/**
 * Transfer history provider. Wraps {@link useMessageHistory} so the header badge and
 * the drawer share one fetch.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { useWallet as useAptosWallet } from "@aptos-labs/wallet-adapter-react";

import { useMessageHistory } from "./useMessageHistory.js";
import {
  TransactionHistoryContext as Ctx,
  type TransactionHistoryContextValue,
} from "./transactionHistoryTypes.js";

/** The API indexes a message a few seconds after the source transaction lands. */
const POST_SEND_REFRESH_DELAY_MS = 8_000;

export function TransactionHistoryProvider({ children }: { children: ReactNode }) {
  const { address: evmAddress } = useAccount();
  const { publicKey: solanaPublicKey } = useSolanaWallet();
  const { account: aptosAccount } = useAptosWallet();

  // Every connected wallet, whatever the user has linked. A message is only
  // findable under the address that sent it, so querying one family would hide
  // transfers made from the others.
  const senders = useMemo(
    () =>
      [evmAddress, solanaPublicKey?.toBase58(), aptosAccount?.address.toString()].filter(
        (a): a is string => Boolean(a)
      ),
    [evmAddress, solanaPublicKey, aptosAccount]
  );

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const history = useMessageHistory({ senders });

  const openDrawer = useCallback((triggerElement?: HTMLElement | null) => {
    triggerElementRef.current = triggerElement ?? null;
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    // Return focus to whatever opened the drawer.
    triggerElementRef.current?.focus();
  }, []);

  const toggleDrawer = useCallback(() => {
    setIsDrawerOpen((open) => !open);
  }, []);

  const { refresh } = history;
  const onTransferSent = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(refresh, POST_SEND_REFRESH_DELAY_MS);
  }, [refresh]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    },
    []
  );

  const value: TransactionHistoryContextValue = {
    ...history,
    senders,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    onTransferSent,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
