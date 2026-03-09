import type { SDKCallEntry, SDKInspectorState } from "./types.js";

const MAX_ENTRIES = 100;
const STORAGE_KEY = "ccip-sdk-inspector-enabled";

function readEnabledFromStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

let state: SDKInspectorState = {
  enabled: readEnabledFromStorage(),
  calls: [],
  activePhase: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const inspectorStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): SDKInspectorState {
    return state;
  },

  setEnabled(enabled: boolean) {
    state = { ...state, enabled };
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // localStorage may not be available
    }
    emit();
  },

  addCall(entry: SDKCallEntry) {
    const calls = [...state.calls, entry].slice(-MAX_ENTRIES);
    state = { ...state, calls, activePhase: entry.phase };
    emit();
  },

  updateCall(id: string, patch: Partial<SDKCallEntry>) {
    state = {
      ...state,
      calls: state.calls.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
    emit();
  },

  /** @param key - pollingId or method to match against */
  updatePollingCall(key: string, patch: Partial<SDKCallEntry>, phase?: string) {
    let idx = -1;
    for (let i = state.calls.length - 1; i >= 0; i--) {
      const c = state.calls[i];
      const entryKey = c?.pollingId ?? c?.method;
      if (entryKey === key && (!phase || c?.phase === phase)) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    const entry = state.calls[idx];
    if (!entry) return;
    const updated = {
      ...entry,
      ...patch,
      pollCount: (entry.pollCount ?? 1) + 1,
    };
    const calls = [...state.calls];
    calls[idx] = updated;
    state = { ...state, calls };
    emit();
  },

  clearCalls() {
    state = { ...state, calls: [], activePhase: null };
    emit();
  },
};
