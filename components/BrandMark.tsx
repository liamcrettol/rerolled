// The revolver-cylinder brand mark (see app/icon.svg and RouletteLoader.tsx).
// Header-sized cut: heavier strokes and mid grays so it stays readable at
// 24-32px on the dark nav, transparent background.
export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className={className}>
      <circle cx="48" cy="48" r="41" stroke="#4b5563" strokeWidth="5" fill="#161b22" />
      <circle cx="48" cy="23.5" r="10" fill="#00aeef" />
      <circle cx="69.22" cy="35.75" r="10" stroke="#6b7280" strokeWidth="4" fill="#101216" />
      <circle cx="69.22" cy="60.25" r="10" stroke="#6b7280" strokeWidth="4" fill="#101216" />
      <circle cx="48" cy="72.5" r="10" stroke="#6b7280" strokeWidth="4" fill="#101216" />
      <circle cx="26.78" cy="60.25" r="10" stroke="#6b7280" strokeWidth="4" fill="#101216" />
      <circle cx="26.78" cy="35.75" r="10" stroke="#6b7280" strokeWidth="4" fill="#101216" />
      <circle cx="48" cy="48" r="5" fill="#6b7280" />
    </svg>
  );
}
