/** Shear's mark: two crossed blades, monochrome to match the UI. */
export function Logo({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="7" cy="17.8" r="2.5" />
      <circle cx="17" cy="17.8" r="2.5" />
      <path d="M8.7 15.6 L18.6 3.4" />
      <path d="M15.3 15.6 L5.4 3.4" />
    </svg>
  )
}
