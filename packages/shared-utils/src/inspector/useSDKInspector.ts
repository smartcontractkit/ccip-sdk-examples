import { useSyncExternalStore, useCallback } from "react";
import { inspectorStore } from "./store.js";

const subscribe = (listener: () => void) => inspectorStore.subscribe(listener);
const getSnapshot = () => inspectorStore.getSnapshot();

export function useSDKInspector() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useSDKInspectorActions() {
  const toggle = useCallback(() => {
    const current = inspectorStore.getSnapshot().enabled;
    inspectorStore.setEnabled(!current);
  }, []);
  const clear = useCallback(() => inspectorStore.clearCalls(), []);
  const setEnabled = useCallback((v: boolean) => inspectorStore.setEnabled(v), []);
  return { toggle, clear, setEnabled };
}
