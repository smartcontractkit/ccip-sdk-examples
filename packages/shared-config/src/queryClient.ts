/**
 * Default React Query client options for CCIP examples.
 * Import from "@ccip-examples/shared-config/queryClient" to keep main entry tanstack-free.
 */

import { QueryClient } from "@tanstack/react-query";

export const DEFAULT_QUERY_OPTIONS = {
  refetchOnWindowFocus: false,
  retry: 3,
  staleTime: 30_000,
} as const;

/**
 * Create a QueryClient with shared default options.
 */
export function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: DEFAULT_QUERY_OPTIONS,
    },
  });
}
