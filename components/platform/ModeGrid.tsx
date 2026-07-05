import Link from "next/link";
import type { ModeDefinition, ModeStatus } from "@/types/platform";
import { HOME_MODE_GRID } from "@/lib/modes/modes";

// Home mode grid (#243/#244/#253). Every card is driven by the mode registry —
// no per-card conditionals here. Disabled roadmap modes (Draft/Ironman) render
// as visibly-inert cards that cannot start a flow.

const STATUS_CLS: Record<ModeStatus, string> = {
  live: "text-green-400 border-green-400/40",
  new: "text-bungie-blue border-bungie-blue/40",
  soon: "text-gray-500 border-bungie-border",
};

function StatusBadge({ status }: { status: ModeStatus }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border ${STATUS_CLS[status]}`}>
      {status}
    </span>
  );
}

function ModeCard({ mode }: { mode: ModeDefinition }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white">{mode.title}</h3>
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
        className="panel p-4 opacity-50 cursor-not-allowed select-none"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={mode.href}
      className="panel p-4 block hover:border-bungie-blue transition-colors"
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
