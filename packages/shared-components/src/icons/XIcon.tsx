/**
 * X / close / failed state icon.
 */

export interface XIconProps {
  className?: string;
  width?: number;
  height?: number;
}

const DEFAULT_SIZE = 16;

export function XIcon({ className, width = DEFAULT_SIZE, height = DEFAULT_SIZE }: XIconProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
