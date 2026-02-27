/**
 * Reusable Button component. Uses design tokens (CSS variables) from shared-brand or app globals.
 */

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "warning" | "success";
  children: ReactNode;
  isLoading?: boolean;
}

export function Button({
  variant = "primary",
  children,
  isLoading,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const buttonClasses = [styles.button, styles[variant], className].filter(Boolean).join(" ");

  return (
    <button className={buttonClasses} disabled={disabled ?? isLoading} {...props}>
      {isLoading ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
