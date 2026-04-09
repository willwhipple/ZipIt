interface Props {
  size?: number;
  className?: string;
}

export default function SuitcaseIcon({ size, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Handle */}
      <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      {/* Body */}
      <rect x="3" y="8" width="18" height="12" rx="2" />
      {/* Horizontal zipper line */}
      <line x1="3" y1="14" x2="21" y2="14" />
      {/* Left vertical strap */}
      <line x1="9" y1="8" x2="9" y2="20" />
      {/* Right vertical strap */}
      <line x1="15" y1="8" x2="15" y2="20" />
      {/* Wheels */}
      <circle cx="7.5" cy="21.5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="21.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
