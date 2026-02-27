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

import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { useAccount, useSwitchChain } from "wagmi";

import { BRAND_COLORS } from "@ccip-examples/shared-brand";
import { wagmiConfig } from "@ccip-examples/shared-config/wagmi";
import { createDefaultQueryClient } from "@ccip-examples/shared-config/queryClient";
import type { FeeTokenOptionItem } from "@ccip-examples/shared-config";
import {
  ErrorBoundary,
  MessageProgress,
  TransferStatus,
  Header,
} from "@ccip-examples/shared-components";
import { Footer } from "./components/layout";
import { WalletConnect, BridgeForm } from "./components/bridge";
import { useTransfer } from "./hooks";
import "@ccip-examples/shared-components/styles/globals.css";
import "@rainbow-me/rainbowkit/styles.css";
import styles from "@ccip-examples/shared-components/layout/AppLayout.module.css";

const queryClient = createDefaultQueryClient();

/**
 * Main application content (inside providers)
 */
function AppContent() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const transfer = useTransfer();

  // Determine if transfer is in progress
  const isLoading = ["estimating", "sending"].includes(transfer.status);

  // Show message progress after successful transfer
  const showMessageProgress = transfer.status === "success" && transfer.messageId;

  const handleEstimateFee = async (
    source: string,
    dest: string,
    token: string,
    amount: string,
    receiver: string,
    feeToken: FeeTokenOptionItem | null
  ) => {
    await transfer.estimateFee(source, dest, token, amount, receiver, feeToken);
  };

  const handleTransfer = async (
    source: string,
    dest: string,
    token: string,
    amount: string,
    receiver: string,
    feeToken: FeeTokenOptionItem | null
  ) => {
    await transfer.transfer(source, dest, token, amount, receiver, feeToken);
  };

  /**
   * Handle chain switching via wagmi
   */
  const handleSwitchChain = (targetChainId: number) => {
    switchChain({ chainId: targetChainId });
  };

  return (
    <div className={styles.app}>
      <Header title="CCIP Simple Bridge" subtitle="EVM-to-EVM token transfers with MetaMask" />

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
              fee={transfer.fee}
              feeFormatted={transfer.feeFormatted}
              estimatedTime={transfer.estimatedTime}
              isLoading={isLoading}
              onEstimateFee={handleEstimateFee}
              onTransfer={handleTransfer}
              onSwitchChain={handleSwitchChain}
              onClearEstimate={transfer.clearEstimate}
              onReset={transfer.reset}
            />

            <TransferStatus
              status={transfer.status}
              error={transfer.error}
              txHash={transfer.txHash}
              messageId={transfer.messageId}
              estimatedTime={transfer.estimatedTime}
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RainbowKitProvider
            theme={darkTheme({
              accentColor: BRAND_COLORS.primary,
              borderRadius: "medium",
            })}
          >
            <AppContent />
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
