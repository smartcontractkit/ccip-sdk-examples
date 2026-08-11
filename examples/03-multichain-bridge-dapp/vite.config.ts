import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

/**
 * Drops the Google Fonts `@import` that `@solana/wallet-adapter-react-ui`'s
 * stylesheet carries.
 *
 * That import fetches DM Sans from fonts.googleapis.com on every page load, which
 * exposes every visitor to a third party and which the deployment's
 * Content-Security-Policy blocks (`style-src 'self'`) anyway, leaving a console
 * error. DM Sans is not the brand font (shared-brand sets Inter) and is only used
 * by the wallet-adapter's own button styles, which fall back to the system sans
 * stack, so dropping it changes nothing visible.
 *
 * Stripping at the source keeps the CSP narrow, and doing it with a rule rather
 * than a vendored copy of the stylesheet means a dependency bump cannot
 * reintroduce the import unnoticed.
 */
function stripRemoteFontImports(): Plugin {
  // Built per call: a /g regex carries lastIndex between uses, which would make
  // it skip files at random.
  const remoteImport = () =>
    /@import\s+(?:url\()?["']https?:\/\/fonts\.googleapis\.com[^"']*["']\)?\s*;/g;
  return {
    name: "strip-remote-font-imports",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".css")) return null;
      const stripped = code.replace(remoteImport(), "");
      return stripped === code ? null : { code: stripped, map: null };
    },
  };
}

/**
 * Vite config for multichain bridge (EVM + Solana).
 * Node polyfills required for Solana SDK; manualChunks for vendor splitting.
 */
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [
    stripRemoteFontImports(),
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
