export default function InvictMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full block"
      role="img"
      aria-label="Invict badge mark"
    >
      <path d="M0.5 0.5 H19.5 L23.5 4.5 V23.5 H0.5 Z" fill="#12151a" stroke="#2a2e36" />
      <rect x={0} y={0} width={2} height={24} fill="#ffffff" />
      <path d="M18.5 2.25 L21.75 5.5" stroke="#c7ccd1" strokeWidth={0.75} opacity={0.9} />

      <g
        transform="translate(2.25 1.2) scale(0.72)"
        stroke="#c7ccd1"
        fill="none"
        strokeWidth={1.35}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M8 27 H24" strokeWidth={1} opacity={0.3} />
        <path d="M12.5 27 H19.5" strokeWidth={2} />
        <path d="M16 27 V20" />
        <path d="M16 4 L19.5 8.25 L16 12.5 L12.5 8.25 Z" />
        <path d="M11.75 10.25 L16 13.75 L11.75 17.25 L7.5 13.75 Z" />
        <path d="M20.25 10.25 L24.5 13.75 L20.25 17.25 L16 13.75 Z" />
        <path d="M16 15.75 L19.5 20 L16 24.25 L12.5 20 Z" />
      </g>

      <path d="M13.5 11.3 L15.6 13.4 L13.5 15.5 L11.4 13.4 Z" fill="#ffffff" />
    </svg>
  );
}
