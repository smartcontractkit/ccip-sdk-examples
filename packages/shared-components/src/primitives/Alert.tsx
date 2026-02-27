/**
 * Alert component for displaying messages.
 */

import { type ReactNode } from "react";
import styles from "./Alert.module.css";

export interface AlertProps {
  variant: "success" | "warning" | "error" | "info";
  children: ReactNode;
}

export function Alert({ variant, children }: AlertProps) {
  return <div className={`${styles.alert} ${styles[variant]}`}>{children}</div>;
}
