/**
 * Clipboard utilities for CCIP examples.
 */

/** Duration (ms) to show "Copied!" state before resetting. Use with copyToClipboard + setTimeout. */
export const COPIED_FEEDBACK_MS = 2000;

/**
 * Copy text to the clipboard. Fire-and-forget; use useCopyToClipboard for UI feedback.
 */
export function copyToClipboard(text: string): void {
  void navigator.clipboard.writeText(text);
}
