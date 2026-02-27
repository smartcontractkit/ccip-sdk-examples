/**
 * Wallet connection component
 *
 * Uses RainbowKit's ConnectButton for a production-ready wallet UX.
 * Supports multiple wallets (MetaMask, WalletConnect, Coinbase, etc.)
 *
 * RainbowKit handles:
 * - Wallet detection and connection
 * - Account/network display
 * - Chain switching UI
 * - Mobile wallet support
 *
 * @see https://www.rainbowkit.com/docs/connect-button
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import styles from "@ccip-examples/shared-components/bridge/WalletConnect.module.css";

/**
 * Wallet connection with RainbowKit
 *
 * No props needed - RainbowKit manages all wallet state internally
 * via wagmi hooks and React context.
 */
export function WalletConnect() {
  return (
    <div className={styles.container}>
      <ConnectButton
        showBalance={false}
        chainStatus="icon"
        accountStatus={{
          smallScreen: "avatar",
          largeScreen: "full",
        }}
      />
    </div>
  );
}
