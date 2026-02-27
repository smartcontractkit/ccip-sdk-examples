/**
 * Hook for copy-to-clipboard with UI feedback (copied state and error).
 */

import { useState, useCallback } from "react";
import { COPIED_FEEDBACK_MS } from "../clipboard.js";

export interface UseCopyToClipboardResult {
  copy: (text: string) => void;
  copied: boolean;
  error: string | null;
}

/**
 * Returns { copy, copied, error }. Call copy(text) to copy; copied is true for COPIED_FEEDBACK_MS.
 */
export function useCopyToClipboard(): UseCopyToClipboardResult {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = useCallback((text: string) => {
    setError(null);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Copy failed";
        setError(message);
      });
  }, []);

  return { copy, copied, error };
}
