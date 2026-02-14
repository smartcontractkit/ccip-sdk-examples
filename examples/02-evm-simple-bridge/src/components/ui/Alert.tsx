/**
 * Alert component for displaying messages
 */

import { type ReactNode } from "react";
import styles from "./Alert.module.css";

interface AlertProps {
  /** Alert visual variant */
  variant: "success" | "warning" | "error" | "info";
  /** Alert content */
  children: ReactNode;
}

export function Alert({ variant, children }: AlertProps) {
  return <div className={`${styles.alert} ${styles[variant]}`}>{children}</div>;
}
