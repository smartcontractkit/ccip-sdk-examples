/**
 * Multichain bridge — provider stack and layout.
 * Order: ErrorBoundary → QueryClient → Wagmi → RainbowKit → Solana → Aptos → ChainContext → TransactionHistory → App.
 */

import { useMemo, useCallback, useContext, lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
  useWallet as useSolanaWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { useWallet as useAptosWallet } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { useAccount, useSwitchChain } from "wagmi";

import { BRAND_COLORS } from "@ccip-examples/shared-brand";
import { wagmiConfig } from "@ccip-examples/shared-config/wagmi";
import { createDefaultQueryClient } from "@ccip-examples/shared-config/queryClient";
import { NETWORKS, type FeeTokenOptionItem } from "@ccip-examples/shared-config";
import { networkInfo, NetworkType } from "@chainlink/ccip-sdk";
import { getWalletAddress, type WalletAddresses } from "@ccip-examples/shared-utils";
import { ErrorBoundary, Header } from "@ccip-examples/shared-components";
import { SDKInspectorToggle } from "@ccip-examples/shared-components/inspector";
import { useSDKInspector } from "@ccip-examples/shared-utils/inspector";
import { ChainContextProvider } from "./hooks/ChainContext.jsx";
import { TransactionHistoryContext } from "./hooks/transactionHistoryTypes.js";
import { TransactionHistoryProvider } from "./hooks/TransactionHistoryContext.jsx";
import { HistoryButton } from "./components/transaction/TransactionHistory.js";
import { TransactionStatusView } from "./components/transaction/TransactionStatusView.js";
import { WalletConnect, BridgeForm } from "./components/bridge/index.js";
import { TransactionHistory } from "./components/transaction/TransactionHistory.js";
import { useTransfer } from "./hooks/useTransfer.js";
import "@ccip-examples/shared-components/styles/globals.css";
import styles from "@ccip-examples/shared-components/layout/AppLayout.module.css";
import appStyles from "./App.module.css";
import "@rainbow-me/rainbowkit/styles.css";

// Lazy load the inspector panel — zero cost when inspector is disabled
const SDKInspectorPanel = lazy(() =>
  import("@ccip-examples/shared-components/inspector").then((m) => ({
    default: m.SDKInspectorPanel,
  }))
);

const queryClient = createDefaultQueryClient();

/** RPC endpoints from shared-config (no wrapper files needed). */
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- key exists in NETWORKS
const SOLANA_RPC = NETWORKS["solana-devnet"]!.rpcUrl;

/**
 * Aptos wallet adapter network — derived from the SDK's networkInfo().
 * Maps the SDK's NetworkType ('MAINNET'|'TESTNET') to the Aptos SDK's Network enum.
 */
const APTOS_NETWORK =
  networkInfo("aptos-testnet").networkType === NetworkType.Mainnet
    ? Network.MAINNET
    : Network.TESTNET;

function AppContent() {
  const { address: evmAddress, chainId } = useAccount();
  const { publicKey: solanaPublicKey } = useSolanaWallet();
  const solanaAddress = solanaPublicKey?.toBase58() ?? null;
  const { account: aptosAccount } = useAptosWallet();
  const aptosAddress = aptosAccount?.address.toString() ?? null;
  const { switchChain } = useSwitchChain();

  const walletAddresses: WalletAddresses = {
    evm: evmAddress ?? null,
    solana: solanaAddress,
    aptos: aptosAddress,
  };

  const transfer = useTransfer();
  const addTransaction = useContext(TransactionHistoryContext).addTransaction;
  const { enabled: inspectorEnabled } = useSDKInspector();

  const isConnected = Boolean(evmAddress ?? solanaAddress ?? aptosAddress);
  const isLoading = ["estimating", "sending"].includes(transfer.status);

  const handleEstimateFee = useCallback(
    async (
      source: string,
      dest: string,
      token: string,
      amount: string,
      receiver: string,
      feeToken: FeeTokenOptionItem | null
    ) => {
      await transfer.estimateFee(source, dest, token, amount, receiver, feeToken);
    },
    [transfer]
  );

  const handleTransfer = useCallback(
    async (
      source: string,
      dest: string,
      token: string,
      amount: string,
      receiver: string,
      feeToken: FeeTokenOptionItem | null,
      remoteToken: string | null
    ) => {
      const result = await transfer.transfer(
        source,
        dest,
        token,
        amount,
        receiver,
        feeToken,
        remoteToken
      );
      if (result?.messageId == null) return;
      const sender = getWalletAddress(source, walletAddresses);
      if (sender)
        addTransaction({
          messageId: result.messageId,
          txHash: result.txHash,
          sourceNetwork: source,
          destNetwork: dest,
          amount,
          tokenSymbol: token,
          receiver,
          sender,
        });
    },
    [transfer, addTransaction, walletAddresses]
  );

  const handleSwitchChain = useCallback(
    (chainId: number) => {
      switchChain({ chainId });
    },
    [switchChain]
  );

  return (
    <div className={styles.app}>
      <Header title="Multichain Family Bridge" subtitle="EVM, Solana, and Aptos token transfers">
        <SDKInspectorToggle />
        <HistoryButton />
      </Header>

      <div className={appStyles.appBody}>
        {inspectorEnabled && (
          <Suspense fallback={null}>
            <SDKInspectorPanel />
          </Suspense>
        )}

        <main className={`${styles.main} ${styles.mainWide}`}>
          <div className={styles.section}>
            <WalletConnect />
          </div>

          {isConnected && (
            <>
              <BridgeForm
                walletAddresses={walletAddresses}
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

              <TransactionStatusView
                status={transfer.status}
                error={transfer.error}
                txHash={transfer.txHash}
                messageId={transfer.messageId}
                estimatedTime={transfer.estimatedTime}
                onReset={transfer.reset}
                lastTransferContext={transfer.lastTransferContext}
                categorizedError={transfer.categorizedError}
              />
            </>
          )}
        </main>
      </div>

      <TransactionHistory />
    </div>
  );
}

export default function App() {
  const solanaWallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

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
            <ConnectionProvider endpoint={SOLANA_RPC}>
              <SolanaWalletProvider wallets={solanaWallets} autoConnect>
                <WalletModalProvider>
                  <AptosWalletAdapterProvider
                    autoConnect={true}
                    dappConfig={{ network: APTOS_NETWORK }}
                    onError={(error) => console.warn("Aptos wallet error:", error)}
                  >
                    <ChainContextProvider>
                      <TransactionHistoryProvider>
                        <AppContent />
                      </TransactionHistoryProvider>
                    </ChainContextProvider>
                  </AptosWalletAdapterProvider>
                </WalletModalProvider>
              </SolanaWalletProvider>
            </ConnectionProvider>
          </RainbowKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
