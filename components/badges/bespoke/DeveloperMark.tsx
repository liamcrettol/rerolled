export default function DeveloperMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full block"
      role="img"
      aria-label="Developer badge mark"
    >
      <path d="M0.5 0.5 H19.5 L23.5 4.5 V23.5 H0.5 Z" fill="#12151a" stroke="#2a2e36" />
      <rect x={0} y={0} width={2} height={24} fill="#00aeef" />
      <path d="M18.5 2.25 L21.75 5.5" stroke="#00aeef" strokeWidth={0.75} opacity={0.9} />

      <g
        stroke="#00aeef"
        fill="none"
        strokeWidth={1.2}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M5.5 20.5 H17.5" strokeWidth={0.8} opacity={0.3} />
        <path d="M11.5 20.5 V5.5" />
        <path d="M5.5 17.5 H8.5 L11.5 14.5" />
        <path d="M17.5 15.5 H14.5 L11.5 12.5" />
        <path d="M8.5 5.5 H14.5" strokeWidth={0.8} />
      </g>

      <rect x={10} y={10} width={3} height={3} fill="#00aeef" />
    </svg>
  );
}
