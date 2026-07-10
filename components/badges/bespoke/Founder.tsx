export default function Founder() {
  return (
    <svg
      viewBox="0 0 160 48"
      className="w-full h-full block"
      role="img"
      aria-label="Founder badge. Played during closed beta or the early launch window."
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
        F
      </text>

      <g
        stroke="#00aeef"
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M8.5 36.5 H40.5" strokeWidth={1} opacity={0.3} />
        <path d="M12 36.5 H39" strokeWidth={2} />
        <path d="M12.5 30.5 H24.5 V36.5 H12.5 Z" />
        <path d="M24.5 30.5 H38.5 V36.5 H24.5 Z" />
        <path d="M16.5 24.5 H29.5 V30.5 H16.5 Z" />
        <path d="M29.5 24.5 H40.5 V30.5 H29.5 Z" />
        <path d="M20.5 18.5 H33.5 V24.5 H20.5 Z" />
      </g>

      <rect x={13} y={31} width={11} height={5} fill="#00aeef" />

      <text
        x={46}
        y={29}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize={10.5}
        fontWeight={800}
        fill="#ffffff"
        letterSpacing={1.1}
      >
        FOUNDER
      </text>
    </svg>
  );
}
