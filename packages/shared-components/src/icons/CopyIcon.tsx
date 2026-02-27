/**
 * Copy-to-clipboard icon (e.g. for receiver address).
 */

export interface CopyIconProps {
  className?: string;
  width?: number;
  height?: number;
}

const DEFAULT_SIZE = 16;

export function CopyIcon({
  className,
  width = DEFAULT_SIZE,
  height = DEFAULT_SIZE,
}: CopyIconProps) {
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
