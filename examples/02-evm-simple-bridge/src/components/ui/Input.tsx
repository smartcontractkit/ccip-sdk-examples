/**
 * Reusable Input component with label and error state
 */

import { type InputHTMLAttributes, forwardRef } from "react";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Input label text */
  label: string;
  /** Error message to display */
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, ...props },
  ref
) {
  return (
    <div className={styles.container}>
      <label className={styles.label}>{label}</label>
      <input
        ref={ref}
        className={`${styles.input} ${error ? styles.inputError : ""} ${className ?? ""}`}
        {...props}
      />
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
});
