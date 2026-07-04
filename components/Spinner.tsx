// Small inline spinner for async loads (character/inventory fetches, weapon
// pool loads, rolls, applies) - a miniature of RouletteLoader's revolver
// cylinder: six chamber dots, one loaded, rotating in stepped 60° clicks.
// Color inherits from the parent's text color via currentColor so it drops
// into any existing text-gray-500/text-white/etc context without extra
// props (#196); the loaded round is full-strength currentColor rather than
// a fixed blue so it stays visible on colored buttons too.
export default function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  const chambers = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    return { x: 12 + 7 * Math.cos(a), y: 12 + 7 * Math.sin(a), loaded: i === 0 };
  });

  return (
    <svg
      className={`shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1.5" className="opacity-20" />
      <g className="animate-cyl-spin origin-center">
        {chambers.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r="2.4"
            fill="currentColor"
            className={c.loaded ? "" : "opacity-30"}
          />
        ))}
      </g>
    </svg>
  );
}
