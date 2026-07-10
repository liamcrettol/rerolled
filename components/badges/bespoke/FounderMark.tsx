export default function FounderMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full block"
      role="img"
      aria-label="Founder badge mark"
    >
      <path
        d="M0.5 0.5 H19.5 L23.5 4.5 V23.5 H0.5 Z"
        fill="#12151a"
        stroke="#2a2e36"
      />
      <rect x={0} y={0} width={2} height={24} fill="#00aeef" />
      <path
        d="M18.5 2.25 L21.75 5.5"
        stroke="#00aeef"
        strokeWidth={0.75}
        opacity={0.9}
      />

      <g
        stroke="#00aeef"
        fill="none"
        strokeWidth={0.9}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M4.5 20.5 H20.5" strokeWidth={0.7} opacity={0.3} />
        <path d="M5.5 15.5 H11.5 V20.5 H5.5 Z" />
        <path d="M11.5 15.5 H18.5 V20.5 H11.5 Z" />
        <path d="M7.5 11.5 H14.5 V15.5 H7.5 Z" />
        <path d="M14.5 11.5 H20.5 V15.5 H14.5 Z" />
        <path d="M9.5 7.5 H16.5 V11.5 H9.5 Z" />
      </g>

      <rect x={6} y={16} width={5} height={4} fill="#00aeef" />
    </svg>
  );
}
