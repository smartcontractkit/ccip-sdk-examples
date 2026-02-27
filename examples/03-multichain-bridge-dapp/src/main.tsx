/**
 * Entry point. Wallet adapter CSS required for Solana wallet modal.
 * If CCIP SDK fails with fetch in a custom env, add a fetch polyfill here.
 */
import "@solana/wallet-adapter-react-ui/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found.");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
