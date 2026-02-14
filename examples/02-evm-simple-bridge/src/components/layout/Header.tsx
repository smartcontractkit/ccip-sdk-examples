/**
 * Application header with title and links
 */

import styles from "./Header.module.css";

export function Header() {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>CCIP Simple Bridge</h1>
      <p className={styles.subtitle}>EVM-to-EVM token transfers with MetaMask</p>
    </header>
  );
}
