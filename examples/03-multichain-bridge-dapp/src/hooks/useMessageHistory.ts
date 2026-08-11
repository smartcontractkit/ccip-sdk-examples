/**
 * Transfer history read from the CCIP API.
 * Paging follows the API cursor. Only non-terminal messages are re-polled.
 *
 * The API filters on one sender per query, and a message is only findable under
 * the address that sent it. A wallet connected on several families therefore
 * needs one query per address, merged newest first, or transfers sent from the
 * other families are missing from the list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CCIPAPIClient, MessageStatus, type MessageSearchResult } from "@chainlink/ccip-sdk";

import { POLLING_CONFIG } from "@chainlink/ccip-examples-shared-config";
import { logSDKCall } from "../inspector/index.js";
import { getAnnotation } from "../inspector/annotations.js";

/** Statuses after which a message never changes again. */
const TERMINAL_STATUSES: string[] = [MessageStatus.Success, MessageStatus.Failed];

/** Messages fetched per sender, per page. */
export const HISTORY_PAGE_SIZE = 10;

/** Cap on messages re-polled per tick. */
const MAX_POLLED_PER_TICK = 5;

export function isInProgress(status: string): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

function newestFirst(a: MessageSearchResult, b: MessageSearchResult): number {
  return new Date(b.sendTimestamp).getTime() - new Date(a.sendTimestamp).getTime();
}

export interface UseMessageHistoryResult {
  messages: MessageSearchResult[];
  /** True while the first page is loading. */
  isLoading: boolean;
  /** True while an additional page is loading. */
  isLoadingMore: boolean;
  /** At least one sender has another page. */
  hasMore: boolean;
  error: string | null;
  /** How many loaded messages have not reached a terminal status. */
  pendingCount: number;
  loadMore: () => void;
  /** Discard everything and re-read the first page. */
  refresh: () => void;
}

export interface UseMessageHistoryOptions {
  /** Every connected wallet address. History is empty while this is empty. */
  senders: string[];
  /** Set false to stop fetching. The provider leaves it on, because the header badge needs the count while the drawer is closed. */
  enabled?: boolean;
  pageSize?: number;
}

export function useMessageHistory({
  senders,
  enabled = true,
  pageSize = HISTORY_PAGE_SIZE,
}: UseMessageHistoryOptions): UseMessageHistoryResult {
  const [messages, setMessages] = useState<MessageSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Cursor per sender: each query paginates independently.
  const cursorsRef = useRef<Record<string, string | undefined>>({});
  const inFlightRef = useRef(false);
  // A "first" fetch deliberately supersedes an in-flight one, so the winner must
  // be decided by claim order rather than by which response lands first.
  const fetchIdRef = useRef(0);
  const apiClientRef = useRef<CCIPAPIClient | null>(null);

  const apiClient = useMemo(() => {
    apiClientRef.current ??= new CCIPAPIClient();
    return apiClientRef.current;
  }, []);

  // Stable identity so the effects below do not restart on every render.
  const sendersKey = senders.join(",");

  const fetchPage = useCallback(
    async (mode: "first" | "next") => {
      const list = sendersKey ? sendersKey.split(",") : [];
      if (list.length === 0) return;
      // A first fetch supersedes whatever is running: connecting a second wallet
      // changes the sender set mid-flight, and dropping that request would leave
      // the new wallet's transfers permanently missing. Only paging waits.
      if (mode === "next" && inFlightRef.current) return;
      const fetchId = ++fetchIdRef.current;
      const isCurrent = () => fetchId === fetchIdRef.current;
      inFlightRef.current = true;
      if (mode === "first") setIsLoading(true);
      else setIsLoadingMore(true);
      setError(null);

      try {
        // Only senders with a cursor still have pages left.
        const targets =
          mode === "next" ? list.filter((s) => cursorsRef.current[s] !== undefined) : list;

        const pages = await Promise.all(
          targets.map(async (sender) => {
            const cursor = mode === "next" ? cursorsRef.current[sender] : undefined;
            const page = await logSDKCall(
              {
                method: "CCIPAPIClient.searchMessages",
                phase: "tracking",
                displayArgs: {
                  sender,
                  limit: String(pageSize),
                  ...(cursor ? { cursor } : {}),
                },
                ...getAnnotation("CCIPAPIClient.searchMessages"),
              },
              () => apiClient.searchMessages({ sender }, { limit: pageSize, cursor })
            );
            return { sender, page };
          })
        );

        if (!isCurrent()) return;

        for (const { sender, page } of pages) {
          cursorsRef.current[sender] = page.hasNextPage ? page.cursor : undefined;
        }
        setHasMore(Object.values(cursorsRef.current).some((c) => c !== undefined));

        const incoming = pages.flatMap(({ page }) => page.data);
        setMessages((prev) => {
          const base = mode === "first" ? [] : prev;
          const seen = new Set(base.map((m) => m.messageId));
          return [...base, ...incoming.filter((m) => !seen.has(m.messageId))].sort(newestFirst);
        });
      } catch (err) {
        if (!isCurrent()) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [apiClient, pageSize, sendersKey]
  );

  const loadMore = useCallback(() => {
    if (!hasMore || inFlightRef.current) return;
    void fetchPage("next");
  }, [fetchPage, hasMore]);

  const refresh = useCallback(() => {
    cursorsRef.current = {};
    setHasMore(false);
    void fetchPage("first");
  }, [fetchPage]);

  // First page, and a reset when the connected set actually changes. Comparing
  // against the previous value matters: the wallet hooks re-render with the same
  // addresses while a page is loading, and resetting on every run discards rows
  // the user has already paged in.
  const loadedForRef = useRef<string | null>(null);

  useEffect(() => {
    const target = enabled ? sendersKey : "";
    if (loadedForRef.current === target) return;
    loadedForRef.current = target;

    cursorsRef.current = {};
    setMessages([]);
    setHasMore(false);
    setError(null);
    if (!target) return;
    void fetchPage("first");
  }, [enabled, sendersKey, fetchPage]);

  const pendingIds = useMemo(
    () => messages.filter((m) => isInProgress(m.status)).map((m) => m.messageId),
    [messages]
  );

  // Stable effect dependency: restarts the interval only when the pending set changes.
  const pendingKey = pendingIds.join(",");
  const pendingIdsRef = useRef<string[]>(pendingIds);
  pendingIdsRef.current = pendingIds;

  useEffect(() => {
    if (!enabled || pendingKey === "") return;

    let cancelled = false;

    const tick = async () => {
      const batch = pendingIdsRef.current.slice(0, MAX_POLLED_PER_TICK);
      const updates = await Promise.all(
        batch.map(async (messageId) => {
          try {
            const full = await logSDKCall(
              {
                method: "CCIPAPIClient.getMessageById",
                phase: "tracking",
                // A short label so concurrent polls are distinguishable in the panel.
                displayArgs: { messageId, label: `${messageId.slice(0, 10)}…` },
                ...getAnnotation("CCIPAPIClient.getMessageById"),
                isPolling: true,
                pollingId: `CCIPAPIClient.getMessageById:${messageId}`,
              },
              () => apiClient.getMessageById(messageId)
            );
            return { messageId, status: full.metadata.status };
          } catch {
            // A transient API failure must not clear the row; keep the old
            // status and try again on the next tick.
            return null;
          }
        })
      );
      if (cancelled) return;

      const byId = new Map(
        updates.filter((u) => u !== null).map((u) => [u.messageId, u.status] as const)
      );
      if (byId.size === 0) return;

      setMessages((prev) =>
        prev.map((m) => {
          const next = byId.get(m.messageId);
          return next && next !== m.status ? { ...m, status: next } : m;
        })
      );
    };

    const interval = setInterval(() => void tick(), POLLING_CONFIG.initialDelay);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, pendingKey, apiClient]);

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    pendingCount: pendingIds.length,
    loadMore,
    refresh,
  };
}
