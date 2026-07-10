export default function Developer() {
  return (
    <svg
      viewBox="0 0 160 48"
      className="w-full h-full block"
      role="img"
      aria-label="Developer badge. Project maintainer."
    >
      <path
        d="M0.5 0.5 H146.5 L159.5 13.5 V47.5 H0.5 Z"
        fill="#12151a"
        stroke="#2a2e36"
        strokeWidth={1}
      />

      <rect x={0} y={0} width={2} height={48} fill="#00aeef" />

      <path
        d="M144.5 2 L157.5 15"
        stroke="#00aeef"
        strokeWidth={1}
        opacity={0.9}
      />

      <text
        x={152}
        y={44}
        textAnchor="end"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize={21}
        fontWeight={800}
        fill="#00aeef"
        opacity={0.08}
        letterSpacing={1}
      >
        D
      </text>

      <g
        stroke="#00aeef"
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M8.5 36.5 H40.5" strokeWidth={1} opacity={0.3} />
        <path d="M20.5 36.5 H30.5" strokeWidth={2} />
        <path d="M25.5 36.5 V11.5" />
        <path d="M14.5 31.5 H19.5 L25.5 25.5" />
        <path d="M14.5 28.5 V34.5" strokeWidth={1} />
        <path d="M36.5 27.5 H31.5 L25.5 21.5" />
        <path d="M36.5 24.5 V30.5" strokeWidth={1} />
        <path d="M21.5 11.5 H29.5" strokeWidth={1} />
      </g>

      <rect x={24} y={18} width={3} height={3} fill="#00aeef" />

      <text
        x={46}
        y={29}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize={9.5}
        fontWeight={800}
        fill="#ffffff"
        letterSpacing={0.8}
      >
        DEVELOPER
      </text>
    </svg>
  );
}
