/**
 * Application entry point
 *
 * Renders the React app with StrictMode for development checks.
 */

/**
 * Fetch binding fix for polyfills
 *
 * Some bundlers/polyfills break the native fetch context, causing
 * "Illegal invocation" errors. This fix rebinds fetch to globalThis.
 *
 * @see CCIP SDK browser setup guide
 */
if (typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => originalFetch.call(globalThis, input, init);
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@ccip-examples/shared-brand/design-tokens.css"; // Shared design tokens
import App from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found. Check your index.html file.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
