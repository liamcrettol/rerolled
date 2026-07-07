import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Crosshair, Timer, Skull, Target } from "lucide-react";
import PlatformShell from "@/components/platform/PlatformShell";
import RunFlow from "@/components/runs/RunFlow";
import { getMode } from "@/lib/modes/modes";
import { DEFAULT_SCORE_ATTACK_SCORING } from "@/lib/scoreAttack/scoring";

// Score Attack (#244/#246): solo run mode — roll a loadout from your own
// inventory, clear any PvE activity, and get scored automatically from the
// PGCR. Amber-themed to give the mode its own identity vs. the blue weekly.
export const dynamic = "force-dynamic";

const S = DEFAULT_SCORE_ATTACK_SCORING;

const SCORING_POINTS = [
  {
    icon: Target,
    label: "Rolled-weapon kills",
    detail: `+${S.rolledWeaponKillPoints} each, +${S.rolledWeaponPrecisionBonus} per precision kill. Kills with anything else score nothing.`,
  },
  {
    icon: Timer,
    label: "Clear time",
    detail: `Beat ${Math.round(S.targetDurationSeconds / 60)} minutes for a time bonus; slower clears bleed points.`,
  },
  {
    icon: Skull,
    label: "Deaths",
    detail: `−${S.deathPenalty} each. Completion itself banks ${S.completionScore.toLocaleString()}.`,
  },
];

export default async function ScoreAttackPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const mode = getMode("score_attack");

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="max-w-3xl space-y-8">
        <section className="panel border-l-2 border-l-amber-400 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Crosshair size={14} className="text-amber-400" aria-hidden="true" />
            <p className="section-label text-amber-400">Score Attack</p>
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border text-amber-400 border-amber-400/40">
              New
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-white">
            {mode.description}
          </h1>
          <p className="text-sm text-gray-400 mt-2 max-w-xl">
            Roll three guns from your own inventory, equip them, and clear any PvE activity. Your
            clear is detected from your match history and scored automatically. No screenshots, no
            honor system.
          </p>

          <div className="mt-6">
            <RunFlow mode="score_attack" accent="amber" />
          </div>
        </section>

        <section>
          <p className="section-label mb-3">How scoring works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SCORING_POINTS.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="panel p-4">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-amber-400" aria-hidden="true" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{label}</h3>
                </div>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Swapping off your rolled guns mid-run flags the score. Equipment is spot-checked while
            you play.
          </p>
        </section>
      </div>
    </PlatformShell>
  );
}
