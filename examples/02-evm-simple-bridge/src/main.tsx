/**
 * Application entry point
 *
 * Renders the React app with StrictMode for development checks.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
