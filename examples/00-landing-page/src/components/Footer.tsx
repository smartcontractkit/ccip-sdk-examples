import { EXTERNAL_URLS } from "@chainlink/ccip-examples-shared-config";
import styles from "./Footer.module.css";

const REPO_URL = "https://github.com/smartcontractkit/ccip-sdk-examples";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p className={styles.disclaimer}>
        Testnet only. Code provided &ldquo;AS IS&rdquo; for educational purposes.
      </p>
      <nav className={styles.links} aria-label="External resources">
        <a href={EXTERNAL_URLS.docs} target="_blank" rel="noopener noreferrer">
          CCIP Docs
        </a>
        <span className={styles.separator} aria-hidden="true">
          |
        </span>
        <a href={EXTERNAL_URLS.ccipExplorer} target="_blank" rel="noopener noreferrer">
          Explorer
        </a>
        <span className={styles.separator} aria-hidden="true">
          |
        </span>
        <a href={EXTERNAL_URLS.faucets} target="_blank" rel="noopener noreferrer">
          Faucets
        </a>
        <span className={styles.separator} aria-hidden="true">
          |
        </span>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </nav>
    </footer>
  );
}
