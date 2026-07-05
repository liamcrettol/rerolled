import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import PlatformShell from "@/components/platform/PlatformShell";
import { getMode } from "@/lib/modes/modes";

// Score Attack start-screen placeholder (#244/#246). The mode is routable now so
// the home grid isn't a dead card, but the run lifecycle (#246), PvE PGCR
// parsing (#247), and scoring model (#248) are separate tickets — this screen
// frames the mode and points back to the lobby until that loop exists.
export const dynamic = "force-dynamic";

export default async function ScoreAttackPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");

  const mode = getMode("score_attack");

  return (
    <PlatformShell displayName={session.displayName}>
      <div className="max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <p className="section-label text-bungie-blue">Score Attack</p>
          <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 border text-bungie-blue border-bungie-blue/40">
            New
          </span>
        </div>
        <h1 className="text-2xl font-bold uppercase tracking-tight text-white">{mode.description}</h1>

        <div className="panel p-5 mt-6 space-y-3">
          <p className="text-sm text-gray-300">
            Roll an awkward loadout, run the selected PvE activity, and get scored on clear time,
            deaths, and how many kills you land with the rolled guns.
          </p>
          <p className="text-xs text-gray-500">
            The run lifecycle, PvE match detection, and scoring model are still being built. For now
            you can start a Gun Roulette lobby and run activities manually.
          </p>
          <div className="flex gap-3 pt-1">
            <Link
              href="/lobby/new"
              className="bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-4 py-2 transition-colors"
            >
              Start a Lobby
            </Link>
            <Link
              href="/dashboard"
              className="border border-bungie-border text-gray-300 hover:border-gray-400 text-xs font-bold uppercase tracking-wider px-4 py-2 transition-colors"
            >
              Back
            </Link>
          </div>
        </div>
      </div>
    </PlatformShell>
  );
}
