import Link from "next/link";
import { Dices, Crosshair, Swords, Skull, CalendarClock } from "lucide-react";
import type { ModeAccent, ModeDefinition, ModeId, ModeStatus } from "@/types/platform";
import { HOME_MODE_GRID } from "@/lib/modes/modes";

// Home mode grid (#243/#244/#253). Every card is driven by the mode registry —
// no per-card conditionals here. Each mode carries its own accent + icon so
// the hub reads as distinct activities. Disabled roadmap modes (Draft/Ironman)
// render as visibly-inert cards that cannot start a flow.

const STATUS_CLS: Record<ModeStatus, string> = {
  live: "text-green-400 border-green-400/40",
  new: "text-bungie-blue border-bungie-blue/40",
  soon: "text-gray-500 border-bungie-border",
};

// Static class sets per accent — Tailwind can't see dynamic class names.
const ACCENT_CLS: Record<ModeAccent, { border: string; icon: string; hover: string }> = {
  green: { border: "border-l-green-400", icon: "text-green-400", hover: "hover:border-green-400" },
  amber: { border: "border-l-amber-400", icon: "text-amber-400", hover: "hover:border-amber-400" },
  blue: { border: "border-l-bungie-blue", icon: "text-bungie-blue", hover: "hover:border-bungie-blue" },
  purple: { border: "border-l-purple-400", icon: "text-purple-400", hover: "hover:border-purple-400" },
  red: { border: "border-l-red-400", icon: "text-red-400", hover: "hover:border-red-400" },
};

const MODE_ICONS: Record<ModeId, typeof Dices> = {
  gun_roulette: Dices,
  score_attack: Crosshair,
  weekly_challenge: CalendarClock,
  draft: Swords,
  ironman: Skull,
};

function StatusBadge({ status }: { status: ModeStatus }) {
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
          <Icon size={16} className={`shrink-0 ${accent.icon}`} aria-hidden="true" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-white truncate">{mode.title}</h3>
        </div>
        <StatusBadge status={mode.status} />
      </div>
      <p className="text-xs text-gray-400 mt-2 leading-relaxed">{mode.description}</p>
    </>
  );

  if (!mode.enabled || !mode.href) {
    // Disabled roadmap card — inert, dimmed, and announced to AT (#253).
    return (
      <div
        aria-disabled="true"
        className={`panel border-l-2 ${accent.border} p-4 opacity-50 cursor-not-allowed select-none`}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={mode.href}
      className={`panel border-l-2 ${accent.border} p-4 block ${accent.hover} transition-colors`}
    >
      {body}
    </Link>
  );
}

export default function ModeGrid() {
  return (
    <section>
      <p className="section-label mb-3">Modes</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {HOME_MODE_GRID.map((mode) => (
          <ModeCard key={mode.id} mode={mode} />
        ))}
      </div>
    </section>
  );
}
