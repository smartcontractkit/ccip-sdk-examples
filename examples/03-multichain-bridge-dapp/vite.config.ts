import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

/**
 * Vite config for multichain bridge (EVM + Solana).
 * Node polyfills required for Solana SDK; manualChunks for vendor splitting.
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
    include: ["react", "react-dom", "viem"],
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
  build: {
    sourcemap: true,
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-evm": ["wagmi", "viem", "@rainbow-me/rainbowkit"],
          "vendor-solana": [
            "@solana/web3.js",
            "@solana/wallet-adapter-base",
            "@solana/wallet-adapter-react",
            "@solana/wallet-adapter-react-ui",
            "@solana/wallet-adapter-wallets",
          ],
          "vendor-ccip": ["@chainlink/ccip-sdk"],
        },
      },
    },
  },
  server: { host: "0.0.0.0", port: 5173 },
  preview: { host: "0.0.0.0", port: 4173 },
});
