import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite configuration following CCIP SDK recommendations
 *
 * Key optimizations:
 * - manualChunks: Split vendor dependencies for better caching
 * - esnext target: Modern browsers, smaller bundle
 * - optimizeDeps: Pre-bundle CJS dependencies for faster dev
 *
 * Note: For EVM-only usage with @chainlink/ccip-sdk/viem, we don't need
 * buffer polyfills. The viem sub-export enables tree-shaking automatically.
 *
 * @see https://github.com/smartcontractkit/ccip-tools-ts
 */
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Pre-bundle CJS dependencies for faster dev mode
    include: ["react", "react-dom", "viem"],
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: { global: "globalThis" },
    },
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          react: ["react", "react-dom"],
          viem: ["viem"],
          wagmi: ["wagmi"],
          rainbowkit: ["@rainbow-me/rainbowkit"],
          "ccip-sdk": ["@chainlink/ccip-sdk"],
          "tanstack-query": ["@tanstack/react-query"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
