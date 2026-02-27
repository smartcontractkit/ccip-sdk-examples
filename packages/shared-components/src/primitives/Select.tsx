/**
 * Reusable Select component with label.
 */

import { type SelectHTMLAttributes, type ReactNode } from "react";
import styles from "./Select.module.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function Select({ label, children, className, ...props }: SelectProps) {
  return (
    <div className={styles.container}>
      <label className={styles.label}>{label}</label>
      <select className={`${styles.select} ${className ?? ""}`.trim()} {...props}>
        {children}
      </select>
    </div>
  );
}
