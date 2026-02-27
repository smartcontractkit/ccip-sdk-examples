/**
 * Wallet connection: EVM (RainbowKit) + Solana + Aptos.
 *
 * All three buttons share the same visual treatment via `.walletButton`
 * while keeping each library's full modal / connection behaviour.
 */

import { useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet as useAptosWallet } from "@aptos-labs/wallet-adapter-react";
import { truncateAddress } from "@ccip-examples/shared-utils";
import styles from "@ccip-examples/shared-components/bridge/WalletConnect.module.css";

// ── EVM ──────────────────────────────────────────────────────────────────────

function EvmConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button type="button" className={styles.walletButton} onClick={openConnectModal}>
                    Connect EVM
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    type="button"
                    className={`${styles.walletButton} ${styles.walletButtonError}`}
                    onClick={openChainModal}
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  className={`${styles.walletButton} ${styles.walletButtonConnected}`}
                  onClick={openAccountModal}
                >
                  {chain.iconUrl && (
                    <img
                      src={chain.iconUrl}
                      alt={chain.name ?? "Chain"}
                      className={styles.walletIcon}
                    />
                  )}
                  {truncateAddress(account.address, 4)}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

// ── Solana ────────────────────────────────────────────────────────────────────

function SolanaConnectButton() {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wallet adapter hook is safe to destructure
  const { publicKey, connected, wallet, disconnect } = useSolanaWallet();
  const { setVisible } = useWalletModal();

  const handleClick = useCallback(() => {
    if (connected) {
      void disconnect();
    } else {
      setVisible(true);
    }
  }, [connected, disconnect, setVisible]);

  return (
    <button
      type="button"
      className={`${styles.walletButton} ${connected ? styles.walletButtonConnected : ""}`}
      onClick={handleClick}
    >
      {connected && publicKey ? (
        <>
          {wallet?.adapter.icon && (
            <img
              src={wallet.adapter.icon}
              alt={wallet.adapter.name}
              className={styles.walletIcon}
            />
          )}
          {truncateAddress(publicKey.toBase58(), 4)}
        </>
      ) : (
        "Connect Solana"
      )}
    </button>
  );
}

// ── Aptos ─────────────────────────────────────────────────────────────────────

function AptosConnectButton() {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wallet adapter hook is safe to destructure
  const { connect, disconnect, connected, account, wallet, wallets } = useAptosWallet();

  const handleClick = useCallback(() => {
    if (connected) {
      void disconnect();
    } else {
      const first = wallets?.[0];
      if (first) void connect(first.name);
    }
  }, [connected, disconnect, connect, wallets]);

  return (
    <button
      type="button"
      className={`${styles.walletButton} ${connected ? styles.walletButtonConnected : ""}`}
      onClick={handleClick}
    >
      {connected && account?.address ? (
        <>
          {wallet?.icon && (
            <img src={wallet.icon} alt={wallet.name} className={styles.walletIcon} />
          )}
          {truncateAddress(account.address.toString(), 4)}
        </>
      ) : (
        "Connect Aptos"
      )}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function WalletConnect() {
  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <span className={styles.label}>EVM</span>
        <EvmConnectButton />
      </div>
      <div className={styles.section}>
        <span className={styles.label}>Solana</span>
        <SolanaConnectButton />
      </div>
      <div className={styles.section}>
        <span className={styles.label}>Aptos</span>
        <AptosConnectButton />
      </div>
    </div>
  );
}
