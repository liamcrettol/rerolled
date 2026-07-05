import type { ReactNode } from "react";

// Shared small pill badge (#227) — the W/L result badge and tier-style badges
// were hand-rolled at their exact classes in ~6 places (LobbyStatsPanel's
// match history/session banner, WatchView, the stats page). Tone maps to the
// same color pairs already in use; size covers the two paddings seen (the
// compact history-row badge vs. the slightly larger summary-card badge).
type Tone = "win" | "loss" | "neutral";

const TONE_CLS: Record<Tone, string> = {
  win: "text-green-400 bg-green-400/10 border-green-400/30",
  loss: "text-red-400 bg-red-400/10 border-red-400/30",
  neutral: "text-gray-500 border-transparent",
};

interface Props {
  children: ReactNode;
  tone: Tone;
  /** "compact" = inline row badge (10px, tight leading). "roomy" = summary/table-cell badge (10px, py-0.5, no forced leading). */
  size?: "compact" | "roomy";
  className?: string;
}

export default function Badge({ children, tone, size = "compact", className = "" }: Props) {
  const sizeCls = size === "roomy" ? "text-[10px] px-1.5 py-0.5" : "text-[10px] px-1 leading-tight";
  return (
    <span className={`font-bold border ${TONE_CLS[tone]} ${sizeCls} ${className}`}>
      {children}
    </span>
  );
}
