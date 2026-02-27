/**
 * Error boundary for React trees. Use as top-level wrapper for graceful degradation.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  Fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div
      style={{ padding: "2rem", textAlign: "center", fontFamily: "var(--font-sans, sans-serif)" }}
    >
      <h2>Something went wrong</h2>
      <p style={{ color: "var(--color-text-secondary, #666)", marginBottom: "1rem" }}>
        {error.message}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: "0.5rem 1rem",
          cursor: "pointer",
          backgroundColor: "var(--color-primary, #0847f7)",
          color: "white",
          border: "none",
          borderRadius: "4px",
        }}
      >
        Try again
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  reset = (): void => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      const Fallback = this.props.Fallback ?? DefaultFallback;
      return <Fallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}
