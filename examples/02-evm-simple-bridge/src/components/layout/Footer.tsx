/**
 * Application footer with helpful links
 *
 * Uses centralized URLs from shared-config to avoid duplication.
 */

import { EXTERNAL_URLS } from "@ccip-examples/shared-config";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p>
        This is a testnet example. Get test tokens from{" "}
        <a
          href={EXTERNAL_URLS.faucets}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          Chainlink Faucets
        </a>
      </p>
      <p>
        <a
          href={EXTERNAL_URLS.docs}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          CCIP Documentation
        </a>
        {" | "}
        <a
          href={EXTERNAL_URLS.ccipExplorer}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          CCIP Explorer
        </a>
      </p>
    </footer>
  );
}
