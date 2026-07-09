import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ModeDefinition, ModeStatus } from "@/types/platform";
import type { Lobby, LobbyMode } from "@/types/lobby";
import { HOME_MODE_GRID } from "@/lib/modes/modes";
import JoinLobbyCard from "./JoinLobbyCard";
import { MODE_ICONS, ACCENT_CLS } from "./modeVisuals";

// Home mode grid (#243/#244/#253). Every card is driven by the mode registry —
// no per-card conditionals here. Each mode carries its own accent + icon.
// Disabled roadmap modes render as visibly-inert cards that cannot start a flow.

const STATUS_CLS: Record<ModeStatus, string> = {
  live: "text-green-400 border-green-400/40",
  new: "text-bungie-blue border-bungie-blue/40",
  soon: "text-gray-500 border-bungie-border",
};

function StatusBadge({ status }: { status: ModeStatus }) {
  // "live" just means "the original, always-on mode" — badging it reads as
  // "a match is happening right now," which is wrong. Only NEW/SOON need a
  // callout; the flagship mode doesn't announce itself.
  if (status === "live") return null;

  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_CLS[status]}`}>
      {status}
    </span>
  );
}

function ModeCard({ mode }: { mode: ModeDefinition }) {
  const accent = ACCENT_CLS[mode.accent];
  const Icon = MODE_ICONS[mode.id];

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={18} className={`shrink-0 ${accent.icon}`} aria-hidden="true" />
          <p className={`text-[10px] font-bold uppercase tracking-widest ${accent.icon}`}>{mode.eyebrow}</p>
        </div>
        <StatusBadge status={mode.status} />
      </div>
      <h3 className="mt-4 max-w-[14ch] text-xl font-bold uppercase leading-tight tracking-wide text-white">
        {mode.title}
      </h3>
      <div
        className={`mt-auto pt-6 text-[11px] font-bold uppercase tracking-widest inline-flex items-center gap-1 ${
          mode.enabled ? accent.action : "text-gray-600"
        }`}
      >
        {mode.ctaLabel}
        {mode.enabled && <ArrowRight size={12} aria-hidden="true" />}
      </div>
    </>
  );

  if (!mode.enabled || !mode.href) {
    // Disabled roadmap card — inert, dimmed, and announced to AT (#253).
    return (
      <div
        aria-disabled="true"
        className={`panel border-l-2 ${accent.border} flex min-h-[190px] flex-col p-5 opacity-50 cursor-not-allowed select-none`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={mode.href}
      className={`panel border-l-2 ${accent.border} block min-h-[190px] p-5 transition-colors ${accent.hover}`}
    >
      {body}
    </Link>
  );
}

// The grid is four columns wide and the registry holds three modes, so the
// join/rejoin tile fills the cell that was sitting empty rather than living in
// its own section below the fold.
export default function ModeGrid({
  activeSession,
}: {
  activeSession?: { code: string; status: Lobby["status"]; mode: LobbyMode } | null;
}) {
  return (
    <section>
      <p className="section-label mb-4">Modes</p>
      <div className="grid grid-cols-1 gap-4 md:auto-rows-fr md:grid-cols-2">
        {HOME_MODE_GRID.map((mode) => (
          <ModeCard key={mode.id} mode={mode} />
        ))}
        <JoinLobbyCard activeSession={activeSession} />
      </div>
    </section>
  );
}
