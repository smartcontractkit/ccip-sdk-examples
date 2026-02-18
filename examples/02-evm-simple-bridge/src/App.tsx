/**
 * 02-evm-simple-bridge
 *
 * A minimal EVM-to-EVM bridge using wagmi, viem, and RainbowKit.
 *
 * This example demonstrates:
 * - Modern wallet integration with wagmi + RainbowKit
 * - CCIP SDK integration via viem adapter
 * - Fee estimation with lane latency before transfer
 * - Token approval + CCIP send flow
 * - Transaction status tracking via CCIPAPIClient
 *
 * Architecture:
 * - wagmi provides React hooks for wallet state
 * - viem provides low-level Ethereum primitives
 * - RainbowKit provides wallet connection UI
 * - CCIP SDK provides cross-chain messaging
 *
 * Provider hierarchy:
 * QueryClientProvider > WagmiProvider > RainbowKitProvider > App
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { useAccount, useSwitchChain } from "wagmi";

import { wagmiConfig } from "./config/wagmi.js";
import { Header, Footer } from "./components/layout";
import { WalletConnect, BridgeForm, TransferStatus, MessageProgress } from "./components/bridge";
import { useTransfer, useMessageStatus } from "./hooks";
import "./styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import styles from "./App.module.css";

/**
 * React Query client for async state management
 *
 * Used by wagmi for caching blockchain data.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 3,
      staleTime: 30_000,
    },
  },
});

/**
 * Main application content (inside providers)
 */
function AppContent() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const transfer = useTransfer();

  // Track network IDs for explorer links
  const [sourceNetworkId, setSourceNetworkId] = useState<string | null>(null);
  const [destNetworkId, setDestNetworkId] = useState<string | null>(null);

  // Get destination transaction hash from message status
  const messageStatus = useMessageStatus(transfer.messageId);

  // Determine if transfer is in progress
  const isLoading = ["estimating", "sending"].includes(transfer.status);

  // Show message progress after successful transfer
  const showMessageProgress = transfer.status === "success" && transfer.messageId;

  /**
   * Handle fee estimation
   */
  const handleEstimateFee = async (
    source: string,
    dest: string,
    token: string,
    amount: string,
    receiver: string,
    feeToken: "native" | "link"
  ) => {
    setSourceNetworkId(source);
    setDestNetworkId(dest);
    await transfer.estimateFee(source, dest, token, amount, receiver, feeToken);
  };

  /**
   * Handle transfer execution
   */
  const handleTransfer = async (
    source: string,
    dest: string,
    token: string,
    amount: string,
    receiver: string,
    feeToken: "native" | "link"
  ) => {
    setSourceNetworkId(source);
    setDestNetworkId(dest);
    await transfer.transfer(source, dest, token, amount, receiver, feeToken);
  };

  /**
   * Handle chain switching via wagmi
   */
  const handleSwitchChain = (targetChainId: number) => {
    switchChain({ chainId: targetChainId });
  };

  return (
    <div className={styles.container}>
      <Header />

      <main className={styles.main}>
        {/* Wallet Connection - RainbowKit handles the UI */}
        <div className={styles.section}>
          <WalletConnect />
        </div>

        {/* Bridge Form (only when connected) */}
        {isConnected && (
          <>
            <BridgeForm
              walletAddress={address ?? null}
              currentChainId={chainId ?? null}
              feeFormatted={transfer.feeFormatted}
              estimatedTime={transfer.estimatedTime}
              isLoading={isLoading}
              onEstimateFee={handleEstimateFee}
              onTransfer={handleTransfer}
              onSwitchChain={handleSwitchChain}
            />

            <TransferStatus
              status={transfer.status}
              error={transfer.error}
              txHash={transfer.txHash}
              messageId={transfer.messageId}
              estimatedTime={transfer.estimatedTime}
              sourceNetworkId={sourceNetworkId}
              destNetworkId={destNetworkId}
              destTxHash={messageStatus.destTxHash}
              onReset={transfer.reset}
            />

            {/* Message progress stepper with real-time polling */}
            {showMessageProgress && transfer.messageId && (
              <MessageProgress messageId={transfer.messageId} />
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

/**
 * Root App with providers
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#0847F7", // Primary blue
            borderRadius: "medium",
          })}
        >
          <AppContent />
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
