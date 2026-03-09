/** Phase of the SDK call in the transfer lifecycle */
export type SDKCallPhase = "setup" | "estimation" | "transfer" | "tracking";

/** Status of an individual SDK call */
export type SDKCallStatus = "pending" | "success" | "error";

/** Display mode for the inspector */
export type InspectorMode = "quick" | "code";

/** A single logged SDK call */
export interface SDKCallEntry {
  id: string;
  timestamp: number;
  phase: SDKCallPhase;
  method: string;
  /** Optional key for polling aggregation (defaults to method if unset) */
  pollingId?: string;
  displayArgs: Record<string, string>;
  codeSnippet: string;
  status: SDKCallStatus;
  result?: string;
  error?: string;
  durationMs?: number;
  pollCount?: number;
  annotation: {
    what: string;
    whyNow: string;
  };
}

/** Full inspector state */
export interface SDKInspectorState {
  enabled: boolean;
  calls: SDKCallEntry[];
  activePhase: SDKCallPhase | null;
}

/** Options for logging an SDK call */
export interface LogSDKCallOptions {
  method: string;
  phase: SDKCallPhase;
  displayArgs: Record<string, string>;
  codeSnippet: string;
  annotation: { what: string; whyNow: string };
  isPolling?: boolean;
  /** Unique key for polling aggregation when multiple calls share the same method+phase */
  pollingId?: string;
}

/** Callback signature for optional SDK call reporting in shared hooks */
export type SDKCallReporter = (
  method: string,
  args: Record<string, string>,
  result?: unknown,
  durationMs?: number
) => void;
