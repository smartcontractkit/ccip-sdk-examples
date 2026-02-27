/**
 * @ccip-examples/shared-brand
 *
 * Shared design tokens and brand assets for CCIP SDK examples.
 *
 * This package ensures consistent design across all frontend examples.
 */

/**
 * Brand Colors
 *
 * Use these constants for programmatic color access (e.g., in charts, Canvas, etc.)
 * For CSS, prefer importing design-tokens.css to use CSS variables.
 *
 * Colors used across Chainlink CCIP properties (explorer, documentation, bazaar demo).
 */
export const BRAND_COLORS = {
  /** Primary blue */
  primary: "#0847F7",
  /** Dark variant */
  primaryDark: "#0635C4",
  /** Light variant */
  primaryLight: "#8AA6F9",
  /** Hover state for primary */
  primaryHover: "#063FD4",
  /** Light tint for backgrounds */
  primaryBg: "#E8EEFF",
  /** Primary shadow */
  primaryShadow: "rgba(8, 71, 247, 0.2)",

  /** Dark neutral */
  dark: "#0B101C",
  /** Light neutral with subtle blue tint */
  light: "#F8FAFF",
  /** Pure white */
  white: "#FFFFFF",

  /** Success/positive states */
  success: "#217B71",
  /** Success hover */
  successHover: "#1A655C",
  /** Warning states */
  warning: "#F7B808",
  /** Warning hover */
  warningHover: "#D9A207",
  /** Error/destructive states */
  error: "#E54918",

  /** Tertiary background */
  backgroundTertiary: "#EEF1F6",
} as const;

/** @deprecated Use BRAND_COLORS instead */
export const CHAINLINK_COLORS = BRAND_COLORS;

/**
 * Asset paths for brand assets
 *
 * Use these when importing assets programmatically.
 */
export const BRAND_ASSETS = {
  /** Logo SVG path */
  logo: "/chainlink-logo.svg",
  /** Logo alt text */
  logoAlt: "Chainlink",
} as const;

/**
 * Design token values (matches CSS variables)
 *
 * Use these for programmatic calculations or when CSS variables aren't available.
 */
export const DESIGN_TOKENS = {
  colors: BRAND_COLORS,

  spacing: {
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
  },

  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
  },

  borderRadius: {
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px",
  },

  transitions: {
    fast: "150ms ease",
    normal: "250ms ease",
    slow: "350ms ease",
  },
} as const;
