/**
 * Check / success icon (e.g. copied state, completed step).
 */

export interface CheckIconProps {
  className?: string;
  width?: number;
  height?: number;
}

const DEFAULT_SIZE = 16;

export function CheckIcon({
  className,
  width = DEFAULT_SIZE,
  height = DEFAULT_SIZE,
}: CheckIconProps) {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
