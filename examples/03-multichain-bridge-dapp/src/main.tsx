/**
 * Entry point. Wallet adapter CSS required for Solana wallet modal.
 * If CCIP SDK fails with fetch in a custom env, add a fetch polyfill here.
 */
import "@solana/wallet-adapter-react-ui/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { SUPPORTED_CHAIN_CLASSES } from "./sdkChains.js";

// The array is read so the bundler cannot drop the import; importing it is what
// registers the chain families.
if (SUPPORTED_CHAIN_CLASSES.length === 0) throw new Error("No chain families registered.");

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found.");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
