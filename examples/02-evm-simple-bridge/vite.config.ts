import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

/**
 * Vite configuration following CCIP SDK browser setup recommendations
 *
 * Key optimizations:
 * - manualChunks: Split vendor dependencies for better caching
 * - esnext target: Modern browsers, smaller bundle
 * - optimizeDeps: Pre-bundle CJS dependencies for faster dev
 *
 * Buffer Polyfill:
 * - Required for CCIP SDK (even for EVM-only) due to dev mode pre-bundling
 * - RainbowKit/MetaMask also need crypto, stream, util, process polyfills
 * - See: CCIP SDK browser setup guide
 *
 * @see https://github.com/smartcontractkit/ccip-tools-ts
 */
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "process"],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
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
