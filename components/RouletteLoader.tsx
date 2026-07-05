// Full-screen route loading state: a revolver cylinder with one loaded round
// in Bungie blue, rotating in stepped 60° clicks (see cyl-spin in the
// Tailwind config) - the loadout roulette theme made literal. Used by the per-route
// loading.tsx files; the tiny inline Spinner stays for in-panel fetches.
export default function RouletteLoader({ label }: { label?: string }) {
  const chambers = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = ((i * 60 - 90) * Math.PI) / 180;
    return {
      x: 48 + 26 * Math.cos(a),
      y: 48 + 26 * Math.sin(a),
      loaded: i === 0,
    };
  });

  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      className="flex flex-col items-center justify-center gap-5 min-h-[60vh]"
    >
      <svg
        width={96}
        height={96}
        viewBox="0 0 96 96"
        fill="none"
        aria-hidden="true"
      >
        {/* Top notch: the fixed "hammer" position each chamber clicks into */}
        <path d="M44 2 L52 2 L48 8 Z" className="fill-gray-500" />
        {/* Cylinder body */}
        <circle cx="48" cy="48" r="42" className="stroke-bungie-border" strokeWidth="2.5" fill="rgba(22, 27, 34, 0.9)" />
        {/* Chambers - the group rotates; one round is loaded */}
        <g className="animate-cyl-spin origin-center">
          {chambers.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r="8.5"
              strokeWidth="2"
              className={
                c.loaded
                  ? "fill-bungie-blue stroke-bungie-blue"
                  : "fill-bungie-dark stroke-gray-600"
              }
            />
          ))}
        </g>
        {/* Center pin */}
        <circle cx="48" cy="48" r="7" className="fill-gray-700 stroke-gray-500" strokeWidth="2" />
        <circle cx="48" cy="48" r="2.5" className="fill-gray-400" />
      </svg>
      {label && <p className="text-gray-400 text-sm tracking-wide animate-pulse">{label}</p>}
    </div>
  );
}
