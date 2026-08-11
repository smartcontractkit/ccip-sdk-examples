import chainlinkLogo from "@chainlink/ccip-examples-shared-brand/chainlink-logo.svg";
import "@chainlink/ccip-examples-shared-components/styles/globals.css";
import { EXAMPLES } from "./data/examples";
import { ExampleCard } from "./components/ExampleCard";
import { Footer } from "./components/Footer";
import styles from "./App.module.css";

export default function App() {
  return (
    <div className={styles.app}>
      <header className={styles.hero}>
        <img src={chainlinkLogo} alt="Chainlink" className={styles.logo} />
        <h1 className={styles.title}>CCIP SDK Examples</h1>
        <p className={styles.subtitle}>
          Progressive examples for cross-chain token transfers and messaging with{" "}
          <a
            href="https://www.npmjs.com/package/@chainlink/ccip-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sdkLink}
          >
            @chainlink/ccip-sdk
          </a>
        </p>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          {EXAMPLES.map((example) => (
            <ExampleCard key={example.id} example={example} />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
