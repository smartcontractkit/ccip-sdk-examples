/**
 * Reusable Button component
 *
 * Provides consistent button styling with variants.
 * Uses CSS modules for scoped styling.
 */

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button visual style variant */
  variant?: "primary" | "secondary" | "warning" | "success";
  /** Button content */
  children: ReactNode;
  /** Whether the button is in a loading state */
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
