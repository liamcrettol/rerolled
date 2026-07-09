import type { ReactNode } from "react";

// Shared surface wrapper (#227) — the `bg-bungie-surface border` box repeated
// across ~11 files (LobbyRoom's successors, WeaponPool,
// RollDetails, ApplyStatus, the stats page, the lobby-new page). `border`
// picks between the two border opacities actually in use; everything else
// (padding, overflow, extra layout classes) stays on the caller via
// `className` so this doesn't have to guess every call site's spacing.
interface Props {
  children: ReactNode;
  className?: string;
  border?: "default" | "subtle";
}

export default function Card({ children, className = "", border = "default" }: Props) {
  const borderCls = border === "subtle" ? "border-bungie-border/55" : "border-bungie-border";
  return <div className={`bg-bungie-surface border ${borderCls} ${className}`}>{children}</div>;
}
