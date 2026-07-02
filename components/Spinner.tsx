// Small inline spinner for async loads (character/inventory fetches, weapon
// pool loads, rolls, applies) - color inherits from the parent's text color
// via currentColor so it drops into any existing text-gray-500/text-white/etc
// context without extra props (#196).
export default function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
