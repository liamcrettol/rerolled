"use client";

// Weekly reset countdown (#251).
//
// Ticks client-side (no page refresh) toward the challenge `endsAt`. Renders a
// readable "3d 14h" style value and a clean expired/none state. Server-side
// window enforcement (rejecting late submissions) lives with the run flow — this
// component is the display half only.

import { useEffect, useState } from "react";

function format(msRemaining: number): string {
  if (msRemaining <= 0) return "ENDED";
  const totalMinutes = Math.floor(msRemaining / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface Props {
  /** ISO timestamp the active challenge resets at. Null = no active challenge. */
  endsAt: string | null;
  className?: string;
}

export default function ResetCountdown({ endsAt, className = "" }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    // Minute cadence is plenty for a d/h readout and avoids a per-second render.
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) {
    return <span className={`font-mono text-gray-500 ${className}`}>NO ACTIVE WEEK</span>;
  }

  const remaining = new Date(endsAt).getTime() - now;
  const expired = remaining <= 0;

  return (
    <span className={`font-mono slashed-zero ${expired ? "text-red-400" : "text-white"} ${className}`}>
      {format(remaining)}
    </span>
  );
}
