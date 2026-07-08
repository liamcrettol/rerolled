// Bespoke badge art for trials_lighthouse_writ / "Immaculate" (#309).
//
// Hand-plotted per docs/badge-design-guide.md — the Lighthouse on a stepped
// beam, seven pips for the flawless card, ghost "VII", cut-corner platinum
// silhouette with the trials hairline. Fixed viewBox 0 0 160 48 so it scales
// cleanly to any BadgeChip size; see BESPOKE_BADGES in ./index.ts for where
// it's allowed to render.

export default function Immaculate() {
  return (
    <svg
      viewBox="0 0 160 48"
      className="w-full h-full block"
      role="img"
      aria-label="Immaculate badge. Go Flawless while using valid Rerolled loadouts for every tracked match."
    >
      {/* base: cut-corner silhouette, platinum */}
      <path d="M0.5 0.5 H146.5 L159.5 13.5 V47.5 H0.5 Z" fill="#12151a" stroke="#2a2e36" strokeWidth={1} />
      {/* tier rail, platinum */}
      <rect x={0} y={0} width={2} height={48} fill="#67e8f9" />
      {/* mode hairline: trials purple, parallel to the cut edge */}
      <path d="M144.5 2 L157.5 15" stroke="#a78bfa" strokeWidth={1} opacity={0.9} />

      {/* ghost numeral: the seven-win passage */}
      <text
        x={152}
        y={44}
        textAnchor="end"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize={21}
        fontWeight={800}
        fill="#67e8f9"
        opacity={0.08}
        letterSpacing={1}
      >
        VII
      </text>

      {/* icon zone: the Lighthouse on Mercury */}
      <g stroke="#67e8f9" fill="none" strokeWidth={1.5} strokeLinecap="square">
        <path d="M8 36.5 H40" strokeWidth={1} opacity={0.3} />
        <path d="M19.5 36.5 H30.5" strokeWidth={2} />
        <path d="M21.5 36 L24 17" />
        <path d="M28.5 36 L26 17" />
        <path d="M22.6 22 H27.4" strokeWidth={1} />
        <path d="M25 6 V4" strokeWidth={1} />
      </g>
      {/* the one fill: the beacon */}
      <path d="M25 8 L28.2 11.2 L25 14.4 L21.8 11.2 Z" fill="#67e8f9" />

      {/* beam: stepped dashes, flat light with no gradient */}
      <g fill="#67e8f9">
        <rect x={32} y={10.7} width={9} height={1.4} opacity={0.85} />
        <rect x={45} y={10.7} width={7} height={1.4} opacity={0.6} />
        <rect x={56} y={10.7} width={6} height={1.4} opacity={0.42} />
        <rect x={66} y={10.7} width={5} height={1.4} opacity={0.28} />
        <rect x={75} y={10.7} width={4} height={1.4} opacity={0.17} />
        <rect x={83} y={10.7} width={3} height={1.4} opacity={0.09} />
      </g>

      {/* label: single line */}
      <text
        x={46}
        y={28.5}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize={10.5}
        fontWeight={800}
        fill="#ffffff"
        letterSpacing={0.7}
      >
        IMMACULATE
      </text>

      {/* the card: seven wins, zero losses */}
      <g fill="#67e8f9">
        <rect x={46} y={40} width={3} height={3} opacity={0.7} />
        <rect x={53} y={40} width={3} height={3} opacity={0.7} />
        <rect x={60} y={40} width={3} height={3} opacity={0.7} />
        <rect x={67} y={40} width={3} height={3} opacity={0.7} />
        <rect x={74} y={40} width={3} height={3} opacity={0.7} />
        <rect x={81} y={40} width={3} height={3} opacity={0.7} />
        <rect x={87.5} y={39.5} width={4} height={4} />
      </g>
    </svg>
  );
}
