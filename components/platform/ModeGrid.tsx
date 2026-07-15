import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ModeDefinition } from "@/types/platform";
import type { Lobby, LobbyMode } from "@/types/lobby";
import { HOME_MODE_GRID } from "@/lib/modes/modes";
import JoinLobbyCard from "./JoinLobbyCard";
import { MODE_ICONS, ACCENT_CLS } from "./modeVisuals";

function ModeCard({ mode }: { mode: ModeDefinition }) {
  const accent = ACCENT_CLS[mode.accent];
  const Icon = MODE_ICONS[mode.id];

  return (
    <Link
      href={mode.href ?? "/dashboard"}
      aria-disabled={!mode.enabled}
      className={`panel group relative flex min-h-[250px] flex-col overflow-hidden border-t-2 p-6 transition-colors sm:p-7 ${
        mode.id === "gun_roulette"
          ? "border-t-green-400 hover:border-green-400"
          : "border-t-purple-400 hover:border-purple-400"
      } ${!mode.enabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/[0.025] transition-transform duration-300 group-hover:scale-125" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={20} className={accent.icon} aria-hidden="true" />
          <p className={`text-[10px] font-bold uppercase tracking-widest ${accent.icon}`}>{mode.eyebrow}</p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Play mode</span>
      </div>

      <div className="relative mt-auto pt-12">
        <h3 className="max-w-[12ch] text-2xl font-bold uppercase leading-tight tracking-wide text-white sm:text-3xl">
          {mode.title}
        </h3>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-gray-400">{mode.description}</p>
        <div className={`mt-6 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest ${accent.action}`}>
          {mode.ctaLabel}
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}

export default function ModeGrid({
  activeSession,
}: {
  activeSession?: { code: string; status: Lobby["status"]; mode: LobbyMode } | null;
}) {
  return (
    <section>
      <div className="grid gap-4 md:grid-cols-2">
        {HOME_MODE_GRID.map((mode) => (
          <ModeCard key={mode.id} mode={mode} />
        ))}
      </div>
      <JoinLobbyCard activeSession={activeSession} />
    </section>
  );
}
