import type { ExampleMeta } from "../data/examples";
import styles from "./ExampleCard.module.css";

interface ExampleCardProps {
  example: ExampleMeta;
}

export function ExampleCard({ example }: ExampleCardProps) {
  const isBrowser = example.runtime === "Browser";

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.number}>{example.number}</span>
        <span className={`${styles.badge} ${isBrowser ? styles.badgeBrowser : styles.badgeNode}`}>
          {example.runtime}
        </span>
      </div>

      <h2 className={styles.title}>{example.title}</h2>
      <p className={styles.description}>{example.description}</p>

      <div className={styles.tags}>
        {example.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </div>

      <div className={styles.action}>
        {isBrowser && example.appPath && (
          <a
            href={example.appPath}
            aria-label={`Open App: ${example.title}`}
            className={`${styles.button} ${styles.buttonPrimary}`}
          >
            Open App
          </a>
        )}
        {example.sourceUrl && (
          <a
            href={example.sourceUrl}
            aria-label={`View Source: ${example.title}`}
            className={`${styles.button} ${isBrowser ? styles.buttonSource : styles.buttonSecondary}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Source
          </a>
        )}
      </div>
    </article>
  );
}
