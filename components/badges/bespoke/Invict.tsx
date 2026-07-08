export default function Invict() {
  return (
    <svg
      viewBox="0 0 160 48"
      className="w-full h-full block"
      role="img"
      aria-label="Invict badge. Original Invict group. Founding community badge."
    >
      <path
        d="M0.5 0.5 H146.5 L159.5 13.5 V47.5 H0.5 Z"
        fill="#12151a"
        stroke="#2a2e36"
        strokeWidth={1}
      />

      <rect x={0} y={0} width={2} height={48} fill="#ffffff" />

      <path
        d="M144.5 2 L157.5 15"
        stroke="#c7ccd1"
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
        fill="#ffffff"
        opacity={0.08}
        letterSpacing={1}
      >
        I
      </text>

      <g
        stroke="#c7ccd1"
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M8 36.5 H40" strokeWidth={1} opacity={0.3} />
        <path d="M19.5 36.5 H31.5" strokeWidth={2} />
        <path d="M25.5 36.5 V28.5" />
        <path d="M25.5 5.5 L29.5 10.5 L25.5 15.5 L21.5 10.5 Z" />
        <path d="M20.5 12.5 L25.5 16.5 L20.5 20.5 L15.5 16.5 Z" />
        <path d="M30.5 12.5 L35.5 16.5 L30.5 20.5 L25.5 16.5 Z" />
        <path d="M25.5 18.5 L29.5 23.5 L25.5 28.5 L21.5 23.5 Z" />
      </g>

      <path d="M25 14 L28 17 L25 20 L22 17 Z" fill="#ffffff" />

      <text
        x={46}
        y={29}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize={10.5}
        fontWeight={800}
        fill="#ffffff"
        letterSpacing={1.1}
      >
        INVICT
      </text>
    </svg>
  );
}
