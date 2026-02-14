/**
 * Reusable Select component with label
 */

import { type SelectHTMLAttributes, type ReactNode } from "react";
import styles from "./Select.module.css";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Select label text */
  label: string;
  /** Select options */
  children: ReactNode;
}

export function Select({ label, children, className, ...props }: SelectProps) {
  return (
    <div className={styles.container}>
      <label className={styles.label}>{label}</label>
      <select className={`${styles.select} ${className ?? ""}`} {...props}>
        {children}
      </select>
    </div>
  );
}
