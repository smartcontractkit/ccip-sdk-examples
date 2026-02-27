/**
 * Shared application header with title, subtitle, and optional actions slot.
 */

import type { ReactNode } from "react";
import styles from "./Header.module.css";

export interface HeaderProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export function Header({ title, subtitle, children }: HeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
      <div className={styles.actions}>{children}</div>
    </header>
  );
}
